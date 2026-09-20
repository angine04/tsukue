import { useCallback, useEffect, useState } from "react";
import { formatDate, type UIKey } from "@tsukue/config";
import type {
  AdminSubscriber,
  NewsletterSendResult,
  SubscriberCounts,
  SubscriberStatus,
} from "@tsukue/types";
import { useI18n } from "../../hooks/useI18n";

const STATUSES = [
  "pending",
  "active",
  "unsubscribed",
  "bounced",
  "complained",
] as const satisfies readonly SubscriberStatus[];

const STATUS_LABEL: Record<SubscriberStatus, UIKey> = {
  pending: "admin.subscriberStatus.pending",
  active: "admin.subscriberStatus.active",
  unsubscribed: "admin.subscriberStatus.unsubscribed",
  bounced: "admin.subscriberStatus.bounced",
  complained: "admin.subscriberStatus.complained",
};

type SubscribersResponse =
  | {
      ok: true;
      data: { subscribers: AdminSubscriber[]; counts: SubscriberCounts };
    }
  | { ok: false; error: { code: string; message: string } };

type SendResponse =
  | { ok: true; data: NewsletterSendResult }
  | { ok: false; error: { code: string; message: string } };

interface NewsletterPanelProps {
  lang?: string;
  adminToken?: string;
}

export default function NewsletterPanel({
  lang = "en",
  adminToken = "",
}: NewsletterPanelProps) {
  const { t, tFormat } = useI18n(lang);
  const [status, setStatus] = useState<SubscriberStatus>("active");
  const [subscribers, setSubscribers] = useState<AdminSubscriber[] | null>(
    null,
  );
  const [counts, setCounts] = useState<SubscriberCounts>({});
  const [error, setError] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<NewsletterSendResult | null>(
    null,
  );

  const headers = useCallback(
    (): HeadersInit =>
      adminToken ? { authorization: `Bearer ${adminToken}` } : {},
    [adminToken],
  );

  const load = useCallback(
    async (nextStatus: SubscriberStatus) => {
      setError("");
      setSubscribers(null);
      try {
        const response = await fetch(
          `/api/admin/subscribers?status=${nextStatus}&limit=100`,
          { headers: headers() },
        );
        if (response.status === 401) {
          setError(t("admin.unauthorised"));
          setSubscribers([]);
          return;
        }
        if (!response.ok) {
          setError(tFormat("admin.requestFailed", { status: response.status }));
          setSubscribers([]);
          return;
        }

        const payload = (await response.json()) as SubscribersResponse;
        if (!payload.ok) {
          setError(tFormat("admin.requestFailed", { status: response.status }));
          setSubscribers([]);
          return;
        }
        setSubscribers(payload.data.subscribers);
        setCounts(payload.data.counts);
      } catch {
        setError(t("admin.couldNotReach"));
        setSubscribers([]);
      }
    },
    [headers, t, tFormat],
  );

  useEffect(() => {
    void load(status);
  }, [load, status]);

  async function sendNewsletter() {
    if (subject.trim() === "" || body.trim() === "" || sending) return;
    setSending(true);
    setError("");
    setSendResult(null);
    try {
      const response = await fetch("/api/admin/newsletter/send", {
        method: "POST",
        headers: { ...headers(), "content-type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      if (response.status === 401) {
        setError(t("admin.unauthorised"));
        return;
      }
      if (!response.ok) {
        setError(tFormat("admin.requestFailed", { status: response.status }));
        return;
      }

      const payload = (await response.json()) as SendResponse;
      if (!payload.ok) {
        setError(tFormat("admin.requestFailed", { status: response.status }));
        return;
      }
      setSendResult(payload.data);
    } catch {
      setError(t("admin.couldNotReach"));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mt-12 pt-6 border-t border-t-line">
      <h2 className="font-sans text-[0.95rem] font-semibold m-0 mb-3">
        {t("admin.newsletter")}
      </h2>

      <nav
        className="flex flex-wrap gap-[0.4rem] mb-6"
        aria-label={t("admin.subscribers")}
      >
        {STATUSES.map((name) => (
          <button
            key={name}
            type="button"
            className="font-sans text-[0.85rem] text-ink bg-wash border border-line rounded-[2px] px-[0.7rem] py-[0.3rem] cursor-pointer inline-flex items-center gap-[0.45rem] capitalize focus-visible:outline-offset-2 data-active:border-accent data-active:text-accent"
            data-active={name === status ? "" : undefined}
            aria-current={name === status ? "true" : undefined}
            onClick={() => setStatus(name)}
          >
            {t(STATUS_LABEL[name])}
            <span className="tabular-nums text-muted">{counts[name] ?? 0}</span>
          </button>
        ))}
      </nav>

      {error ? (
        <p
          className="text-[0.9rem] text-accent bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] border-l-[3px] border-l-accent py-[0.6rem] px-[0.8rem] m-0 mb-5"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {subscribers === null ? (
        <p className="text-[0.9rem] text-muted">{t("admin.loading")}</p>
      ) : subscribers.length === 0 ? (
        <p className="text-[0.9rem] text-muted">{t("admin.noSubscribers")}</p>
      ) : (
        <ul className="mb-8">
          {subscribers.map((subscriber) => (
            <li
              key={subscriber.id}
              className="flex flex-wrap items-baseline gap-[0.6rem] py-[0.7rem] border-t border-t-line text-[0.82rem] text-muted"
            >
              <span className="flex-[1_1_12rem] min-w-0 [overflow-wrap:anywhere] text-ink font-code">
                {subscriber.emailMasked}
              </span>
              <span className="text-[0.68rem] uppercase tracking-[0.06em] px-[0.35rem] py-[0.1rem] rounded-[2px] bg-[color-mix(in_srgb,var(--color-muted)_12%,transparent)] text-muted">
                {t(STATUS_LABEL[subscriber.status])}
              </span>
              <time className="flex-[0_1_auto]" dateTime={subscriber.createdAt}>
                {t("admin.joined")}:{" "}
                {formatDate(new Date(subscriber.createdAt), lang)}
              </time>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex flex-col items-stretch gap-2 pt-4 px-0 pb-0 border-t border-t-line"
        onSubmit={(event) => {
          event.preventDefault();
          void sendNewsletter();
        }}
      >
        <label
          className="text-[0.82rem] text-muted"
          htmlFor="newsletter-subject"
        >
          {t("admin.subject")}
        </label>
        <input
          id="newsletter-subject"
          type="text"
          maxLength={200}
          className="w-full font-sans text-[0.92rem] text-ink bg-white border border-line rounded-[2px] p-2 [color-scheme:light] focus-visible:outline-offset-2"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
        <label className="text-[0.82rem] text-muted" htmlFor="newsletter-body">
          {t("admin.bodyHtml")}
        </label>
        <textarea
          id="newsletter-body"
          rows={8}
          maxLength={20000}
          className="w-full font-sans text-[0.92rem] text-ink bg-white border border-line rounded-[2px] p-2 resize-y [color-scheme:light] focus-visible:outline-offset-2"
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <button
          type="submit"
          className="font-sans text-[0.85rem] text-paper-ivory bg-accent border border-accent rounded-[2px] px-[0.7rem] py-[0.3rem] cursor-pointer self-start focus-visible:outline-offset-2 disabled:opacity-[0.45] disabled:cursor-not-allowed"
          disabled={sending || subject.trim() === "" || body.trim() === ""}
        >
          {sending ? t("admin.sending") : t("admin.send")}
        </button>
        {sendResult ? (
          <p className="mt-1 mx-0 mb-0 text-[0.85rem] text-muted" role="status">
            {tFormat("admin.sendResult", {
              sent: sendResult.sent,
              failed: sendResult.failed,
              skipped: sendResult.skipped,
            })}
          </p>
        ) : null}
      </form>
    </section>
  );
}
