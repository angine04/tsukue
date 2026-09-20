import { useCallback, useEffect, useState } from "react";
import { tokenizeCommentLines } from "@tsukue/api/render";
import { DEFAULT_LANG, formatDate, postPath } from "@tsukue/config";
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

interface MailLog {
  id: string;
  category: string;
  provider: string;
  recipientEmailHash: string | null;
  status: "success" | "failure";
  error: string | null;
  createdAt: string;
}

interface MailLogPanelProps {
  lang: string;
  adminToken: string;
}

function MailLogPanel({ lang, adminToken }: MailLogPanelProps) {
  const [logs, setLogs] = useState<MailLog[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState("");

  const headers = useCallback(
    (): HeadersInit =>
      adminToken ? { authorization: `Bearer ${adminToken}` } : {},
    [adminToken],
  );

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin/mail-logs?limit=50", {
        headers: headers(),
      });
      if (!response.ok) {
        setError(`Could not load mail log (${response.status}).`);
        setLogs([]);
        return;
      }
      const payload = (await response.json()) as {
        ok: boolean;
        data?: { logs: MailLog[]; counts: Record<string, number> };
      };
      if (!payload.ok || !payload.data) {
        setError("Could not load mail log.");
        setLogs([]);
        return;
      }
      setLogs(payload.data.logs);
      setCounts(payload.data.counts);
    } catch {
      setError("Could not reach the mail log.");
      setLogs([]);
    }
  }, [headers]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="mt-12 pt-6 border-t border-t-line">
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
        <h2 className="font-sans text-[0.95rem] font-semibold m-0">
          Mail send log
        </h2>
        <span className="text-[0.78rem] text-muted">
          {counts.success ?? 0} succeeded · {counts.failure ?? 0} failed
        </span>
      </div>
      {error ? (
        <p className="text-[0.9rem] text-muted m-0" role="status">
          {error}
        </p>
      ) : logs === null ? (
        <p className="text-[0.9rem] text-muted">Loading mail log…</p>
      ) : logs.length === 0 ? (
        <p className="text-[0.9rem] text-muted m-0">
          No mail send attempts have been recorded.
        </p>
      ) : (
        <ul className="text-[0.8rem] text-muted">
          {logs.map((log) => (
            <li
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 border-t border-t-line"
              key={log.id}
            >
              <span className="font-code text-ink">{log.category}</span>
              <span
                className={
                  log.status === "failure" ? "text-accent" : "text-ink"
                }
              >
                {log.status}
              </span>
              <span>{log.provider}</span>
              <time className="ml-auto" dateTime={log.createdAt}>
                {formatDate(new Date(log.createdAt), lang)}
              </time>
              {log.error ? (
                <span className="basis-full text-accent [overflow-wrap:anywhere]">
                  {log.error}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The dashboard is plain and efficient on purpose (AGENTS 16.3): it is a tool,
 * not a desk. It stays separate from the desk because a tool that looks like a
 * toy is a tool that gets used carelessly. Sans-serif throughout, no paper, no
 * rotation.
 */
function CommentBody({ body }: { body: string }) {
  const lines = tokenizeCommentLines(body);
  return (
    /*
     * Moderation often involves hostile input; it must not widen the page.
     */
    <p className="text-[0.92rem] leading-[1.6] mb-3 [overflow-wrap:anywhere] whitespace-pre-wrap">
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
                className="text-accent focus-visible:outline-offset-2"
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

/**
 * Where a moderator can read the comment in context.
 *
 * Built with the route helper rather than by prefixing the slug with a slash:
 * a comment carries the language of the article it was written on, and both the
 * language and the route mode decide what that URL is. Hand-writing it sent a
 * moderator to a 404 for every article that is not in the default language.
 */
function articlePath(comment: AdminComment): string {
  return postPath({ slug: comment.slug, lang: comment.lang ?? DEFAULT_LANG });
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
    <div className="max-w-[52rem] mx-auto pt-8 px-5 pb-16 font-sans text-ink">
      <header className="flex items-baseline justify-between gap-4 mb-6">
        <h1 className="font-sans text-[1.35rem] font-semibold m-0">
          {t("admin.title")}
        </h1>
        <button
          type="button"
          className="font-sans text-[0.85rem] text-ink bg-wash border border-line rounded-[2px] px-[0.7rem] py-[0.3rem] cursor-pointer focus-visible:outline-offset-2"
          onClick={() => void load(tab, reportedOnly)}
        >
          {t("admin.refresh")}
        </button>
      </header>

      <nav
        className="flex flex-wrap gap-[0.4rem] mb-6"
        aria-label={t("admin.commentStatus")}
      >
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            className="font-sans text-[0.85rem] text-ink bg-wash border border-line rounded-[2px] px-[0.7rem] py-[0.3rem] cursor-pointer inline-flex items-center gap-[0.45rem] capitalize focus-visible:outline-offset-2 data-active:border-accent data-active:text-accent"
            data-active={!reportedOnly && name === tab ? "" : undefined}
            aria-current={!reportedOnly && name === tab ? "true" : undefined}
            onClick={() => {
              setReportedOnly(false);
              setTab(name);
            }}
          >
            {t(STATUS_LABEL[name])}
            <span className="tabular-nums text-muted">{counts[name] ?? 0}</span>
          </button>
        ))}
        {/*
          Last, and separate from the statuses: it lists comments rather than
          filtering them, and it is the only way to find a flagged comment that
          is not in the tab a moderator happens to be looking at.
        */}
        <button
          type="button"
          className="font-sans text-[0.85rem] text-ink bg-wash border border-line rounded-[2px] px-[0.7rem] py-[0.3rem] cursor-pointer inline-flex items-center gap-[0.45rem] capitalize focus-visible:outline-offset-2 data-active:border-accent data-active:text-accent"
          data-active={reportedOnly ? "" : undefined}
          aria-current={reportedOnly ? "true" : undefined}
          onClick={() => setReportedOnly(true)}
        >
          {tFormat("admin.reports", { count: reported })}
        </button>
      </nav>

      {error ? (
        <p
          className="text-[0.9rem] text-accent bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] border-l-[3px] border-l-accent py-[0.6rem] px-[0.8rem] m-0 mb-5"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {comments === null ? (
        <p className="text-[0.9rem] text-muted">{t("admin.loading")}</p>
      ) : comments.length === 0 ? (
        <p className="text-[0.9rem] text-muted">
          {reportedOnly
            ? t("admin.noReports")
            : tFormat("admin.nothingHere", { status: t(STATUS_LABEL[tab]) })}
        </p>
      ) : (
        <ul>
          {comments.map((comment) => (
            <li key={comment.id} className="py-4 border-t border-t-line">
              <div className="flex flex-wrap items-center gap-[0.6rem] text-[0.78rem] text-muted mb-[0.4rem]">
                <span className="text-[0.9rem] font-semibold text-ink">
                  {comment.authorName}
                  {comment.isAuthor ? (
                    <span className="text-[0.68rem] uppercase tracking-[0.06em] px-[0.35rem] py-[0.1rem] rounded-[2px] bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-accent">
                      {t("admin.authorBadge")}
                    </span>
                  ) : null}
                </span>
                <time dateTime={comment.createdAt}>
                  {formatDate(new Date(comment.createdAt), lang)}
                </time>
                <a
                  className="text-muted no-underline font-code hover:underline focus-visible:outline-offset-2"
                  href={articlePath(comment)}
                >
                  {articlePath(comment)}
                </a>
                {comment.parentId ? (
                  <span className="text-[0.68rem] uppercase tracking-[0.06em] px-[0.35rem] py-[0.1rem] rounded-[2px] bg-[color-mix(in_srgb,var(--color-muted)_12%,transparent)] text-muted">
                    {t("admin.replyBadge")}
                  </span>
                ) : null}
                {comment.hasEmail ? (
                  <span
                    className="text-[0.68rem] uppercase tracking-[0.06em] px-[0.35rem] py-[0.1rem] rounded-[2px] bg-[color-mix(in_srgb,var(--color-muted)_12%,transparent)] text-muted"
                    title={t("admin.reachableHint")}
                  >
                    {t("admin.reachableBadge")}
                  </span>
                ) : null}
                {comment.reportCount > 0 ? (
                  /*
                   * A comment readers have flagged.
                   *
                   * Solid rather than tinted, because it is the one badge in
                   * the queue that asks for action and the rest are
                   * descriptions.
                   */
                  <span className="text-[0.68rem] uppercase tracking-[0.06em] px-[0.35rem] py-[0.1rem] rounded-[2px] bg-accent text-paper-ivory">
                    {tFormat("admin.reports", { count: comment.reportCount })}
                  </span>
                ) : null}
              </div>

              <CommentBody body={comment.body} />

              <div className="flex flex-wrap gap-[0.4rem]">
                {ACTIONS.filter((action) => action !== comment.status).map(
                  (action) => (
                    <button
                      key={action}
                      type="button"
                      className="font-sans text-[0.85rem] text-ink bg-wash border border-line rounded-[2px] px-[0.7rem] py-[0.3rem] cursor-pointer focus-visible:outline-offset-2 disabled:opacity-[0.45] disabled:cursor-not-allowed data-[action=delete]:text-accent data-[action=spam]:text-accent"
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
                  className="font-sans text-[0.85rem] text-ink bg-wash border border-line rounded-[2px] px-[0.7rem] py-[0.3rem] cursor-pointer focus-visible:outline-offset-2 disabled:opacity-[0.45] disabled:cursor-not-allowed"
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
                <div className="flex flex-col gap-2 mt-[0.9rem] p-[0.8rem] border-l-[3px] border-l-accent bg-[color-mix(in_srgb,var(--color-muted)_6%,transparent)]">
                  <label
                    className="text-[0.82rem] text-muted"
                    htmlFor={`reply-${comment.id}`}
                  >
                    {t("admin.replyLabel")}
                  </label>
                  <textarea
                    id={`reply-${comment.id}`}
                    rows={3}
                    maxLength={4000}
                    className="font-sans text-[0.92rem] text-ink bg-white border border-line rounded-[2px] p-2 resize-y [color-scheme:light] focus-visible:outline-offset-2"
                    value={replyBody}
                    onChange={(event) => setReplyBody(event.target.value)}
                  />
                  <button
                    type="button"
                    className="font-sans text-[0.85rem] text-paper-ivory bg-accent border border-accent rounded-[2px] px-[0.7rem] py-[0.3rem] cursor-pointer self-start focus-visible:outline-offset-2 disabled:opacity-[0.45] disabled:cursor-not-allowed"
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
        <section className="mt-12 pt-6 border-t border-t-line">
          <h2 className="font-sans text-[0.95rem] font-semibold m-0 mb-3">
            {t("admin.recentActivity")}
          </h2>
          <ul className="text-[0.8rem] text-muted">
            {audit.map((entry) => (
              <li className="flex gap-3 py-1" key={entry.id}>
                <span className="font-code">{entry.action}</span>
                <span className="flex-1">{entry.actor ?? "unknown"}</span>
                <time dateTime={entry.createdAt}>
                  {formatDate(new Date(entry.createdAt), lang)}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <NewsletterPanel lang={lang} adminToken={adminToken} />
      <MailLogPanel lang={lang} adminToken={adminToken} />
    </div>
  );
}
