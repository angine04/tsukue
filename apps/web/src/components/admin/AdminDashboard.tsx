import { useCallback, useEffect, useState } from "react";
import { tokenizeCommentLines } from "@tsukue/api/render";
import { formatDate } from "@tsukue/config";
import type { UIKey } from "@tsukue/config";
import { useI18n } from "../../hooks/useI18n";
import NewsletterPanel from "./NewsletterPanel";

/** The statuses a moderator works through, in the order they appear. */
const TABS = ["pending", "approved", "hidden", "spam", "deleted"] as const;
type Tab = (typeof TABS)[number];

/** Dictionary key for each status, so a tab can be labelled in any language. */
const STATUS_LABEL: Record<Tab, UIKey> = {
  pending: "admin.status.pending",
  approved: "admin.status.approved",
  hidden: "admin.status.hidden",
  spam: "admin.status.spam",
  deleted: "admin.status.deleted",
};

const ACTIONS = ["approve", "hide", "spam", "delete"] as const;
type Action = (typeof ACTIONS)[number];

interface AdminComment {
  id: string;
  slug: string;
  lang?: string;
  parentId?: string;
  authorName: string;
  body: string;
  status: Tab;
  createdAt: string;
  isAuthor: boolean;
  hasEmail: boolean;
  /** How many readers have flagged this comment. */
  reportCount: number;
  ipHash?: string;
}

interface AuditEntry {
  id: string;
  action: string;
  entityId: string;
  actor: string | null;
  createdAt: string;
}

/**
 * The dashboard is plain on purpose (AGENTS 16.3): it is a tool, not a desk.
 * The styling lives in `admin.css` and shares nothing with the card system.
 */
function CommentBody({ body }: { body: string }) {
  const lines = tokenizeCommentLines(body);
  return (
    <p className="admin-comment-body">
      {lines.map((tokens, lineIndex) => (
        <span key={lineIndex}>
          {lineIndex > 0 ? <br /> : null}
          {tokens.map((token, tokenIndex) =>
            token.type === "link" ? (
              <a
                key={tokenIndex}
                href={token.value}
                rel="noopener noreferrer nofollow"
                target="_blank"
              >
                {token.value}
              </a>
            ) : (
              <span key={tokenIndex}>{token.value}</span>
            ),
          )}
        </span>
      ))}
    </p>
  );
}

interface AdminDashboardProps {
  lang?: string;
}

/** Where a developer can stash a token for a deployment without Access. */
const TOKEN_KEY = "adminToken";

export default function AdminDashboard({ lang = "en" }: AdminDashboardProps) {
  const { t, tFormat } = useI18n(lang);
  /**
   * Authentication is Cloudflare Access, which the browser already carries as a
   * cookie — so nothing is read from the build. Deliberately not a prop: this
   * page is statically built, and a token passed in would be baked into public
   * HTML for anyone to read.
   *
   * The sessionStorage read is an escape hatch for working against a
   * deployment that uses ADMIN_TOKEN instead of Access:
   *
   *   sessionStorage.setItem("adminToken", "…")   // then reload
   *
   * It is empty by default, never persisted beyond the tab, and never set by
   * anything the site ships.
   */
  const [adminToken] = useState(() =>
    typeof sessionStorage === "undefined"
      ? ""
      : (sessionStorage.getItem(TOKEN_KEY) ?? ""),
  );
  const [tab, setTab] = useState<Tab>("pending");
  /** True while the queue is showing flagged comments instead of a status. */
  const [reportedOnly, setReportedOnly] = useState(false);
  const [comments, setComments] = useState<AdminComment[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [reported, setReported] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");

  const headers = useCallback(
    (): HeadersInit =>
      adminToken ? { authorization: `Bearer ${adminToken}` } : {},
    [adminToken],
  );

  const load = useCallback(
    async (status: Tab, reportedOnly: boolean) => {
      setError("");
      try {
        // Flagged comments are their own listing, not a status: a report says
        // something about a comment rather than moving it, so a reported
        // comment may be sitting in any tab.
        const listPath = reportedOnly
          ? "/api/admin/reports"
          : `/api/admin/comments?status=${status}`;
        const [listResponse, statsResponse] = await Promise.all([
          fetch(listPath, { headers: headers() }),
          fetch("/api/admin/stats", { headers: headers() }),
        ]);

        if (listResponse.status === 401 || statsResponse.status === 401) {
          setError(t("admin.unauthorised"));
          setComments([]);
          return;
        }
        if (!listResponse.ok || !statsResponse.ok) {
          setError(
            tFormat("admin.requestFailed", { status: listResponse.status }),
          );
          setComments([]);
          return;
        }

        const list = (await listResponse.json()) as {
          data: { comments: AdminComment[] };
        };
        const stats = (await statsResponse.json()) as {
          data: {
            counts: Record<string, number>;
            reported: number;
            audit: AuditEntry[];
          };
        };
        setComments(list.data.comments);
        setCounts(stats.data.counts);
        setReported(stats.data.reported);
        setAudit(stats.data.audit);
      } catch {
        setError(t("admin.couldNotReach"));
        setComments([]);
      }
    },
    [headers, t, tFormat],
  );

  useEffect(() => {
    void load(tab, reportedOnly);
  }, [load, tab, reportedOnly]);

  /**
   * Every action refetches rather than patching local state: the list is
   * short, and a queue that disagrees with the database is worse than a
   * half-second wait.
   */
  async function act(id: string, action: Action) {
    setBusy(`${action}:${id}`);
    setError("");
    try {
      const response = await fetch(`/api/admin/comments/${id}/${action}`, {
        method: "POST",
        headers: headers(),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(
          payload?.error?.message ??
            tFormat("admin.actionFailed", { status: response.status }),
        );
      } else {
        await load(tab, reportedOnly);
      }
    } catch {
      setError(t("admin.couldNotReach"));
    } finally {
      setBusy(null);
    }
  }

  async function sendReply(id: string) {
    if (replyBody.trim() === "") return;
    setBusy(`reply:${id}`);
    setError("");
    try {
      const response = await fetch(`/api/admin/comments/${id}/reply`, {
        method: "POST",
        headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify({ body: replyBody }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(
          payload?.error?.message ??
            tFormat("admin.replyFailed", { status: response.status }),
        );
      } else {
        setReplyTo(null);
        setReplyBody("");
        await load(tab, reportedOnly);
      }
    } catch {
      setError(t("admin.couldNotReach"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin">
      <header className="admin-header">
        <h1>{t("admin.title")}</h1>
        <button
          type="button"
          className="admin-refresh"
          onClick={() => void load(tab, reportedOnly)}
        >
          {t("admin.refresh")}
        </button>
      </header>

      <nav className="admin-tabs" aria-label={t("admin.commentStatus")}>
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            className="admin-tab"
            data-active={!reportedOnly && name === tab ? "" : undefined}
            aria-current={!reportedOnly && name === tab ? "true" : undefined}
            onClick={() => {
              setReportedOnly(false);
              setTab(name);
            }}
          >
            {t(STATUS_LABEL[name])}
            <span className="admin-tab-count">{counts[name] ?? 0}</span>
          </button>
        ))}
        {/*
          Last, and separate from the statuses: it lists comments rather than
          filtering them, and it is the only way to find a flagged comment that
          is not in the tab a moderator happens to be looking at.
        */}
        <button
          type="button"
          className="admin-tab admin-tab--reported"
          data-active={reportedOnly ? "" : undefined}
          aria-current={reportedOnly ? "true" : undefined}
          onClick={() => setReportedOnly(true)}
        >
          {tFormat("admin.reports", { count: reported })}
        </button>
      </nav>

      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}

      {comments === null ? (
        <p className="admin-empty">{t("admin.loading")}</p>
      ) : comments.length === 0 ? (
        <p className="admin-empty">
          {reportedOnly
            ? t("admin.noReports")
            : tFormat("admin.nothingHere", { status: t(STATUS_LABEL[tab]) })}
        </p>
      ) : (
        <ul className="admin-list">
          {comments.map((comment) => (
            <li key={comment.id} className="admin-item">
              <div className="admin-item-meta">
                <span className="admin-author">
                  {comment.authorName}
                  {comment.isAuthor ? (
                    <span className="admin-badge">
                      {t("admin.authorBadge")}
                    </span>
                  ) : null}
                </span>
                <time dateTime={comment.createdAt}>
                  {formatDate(new Date(comment.createdAt), lang)}
                </time>
                <a className="admin-post" href={`/${comment.slug}`}>
                  /{comment.slug}
                </a>
                {comment.parentId ? (
                  <span className="admin-badge admin-badge--muted">
                    {t("admin.replyBadge")}
                  </span>
                ) : null}
                {comment.hasEmail ? (
                  <span
                    className="admin-badge admin-badge--muted"
                    title={t("admin.reachableHint")}
                  >
                    {t("admin.reachableBadge")}
                  </span>
                ) : null}
                {comment.reportCount > 0 ? (
                  <span className="admin-badge admin-badge--flag">
                    {tFormat("admin.reports", { count: comment.reportCount })}
                  </span>
                ) : null}
              </div>

              <CommentBody body={comment.body} />

              <div className="admin-actions">
                {ACTIONS.filter((action) => action !== comment.status).map(
                  (action) => (
                    <button
                      key={action}
                      type="button"
                      className="admin-action"
                      data-action={action}
                      disabled={busy !== null}
                      onClick={() => void act(comment.id, action)}
                    >
                      {action}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className="admin-action"
                  disabled={busy !== null}
                  onClick={() =>
                    setReplyTo(replyTo === comment.id ? null : comment.id)
                  }
                >
                  {replyTo === comment.id
                    ? t("admin.cancel")
                    : t("admin.reply")}
                </button>
              </div>

              {replyTo === comment.id ? (
                <div className="admin-reply">
                  <label htmlFor={`reply-${comment.id}`}>
                    {t("admin.replyLabel")}
                  </label>
                  <textarea
                    id={`reply-${comment.id}`}
                    rows={3}
                    maxLength={4000}
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                  />
                  <button
                    type="button"
                    className="admin-action admin-action--primary"
                    disabled={busy !== null || replyBody.trim() === ""}
                    onClick={() => void sendReply(comment.id)}
                  >
                    {t("admin.publishReply")}
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {audit.length > 0 ? (
        <section className="admin-audit">
          <h2>{t("admin.recentActivity")}</h2>
          <ul>
            {audit.map((entry) => (
              <li key={entry.id}>
                <span className="admin-audit-action">{entry.action}</span>
                <span className="admin-audit-actor">
                  {entry.actor ?? "unknown"}
                </span>
                <time dateTime={entry.createdAt}>
                  {formatDate(new Date(entry.createdAt), lang)}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <NewsletterPanel lang={lang} adminToken={adminToken} />
    </div>
  );
}
