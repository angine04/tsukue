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
    <section className="admin-newsletter">
      <h2>{t("admin.newsletter")}</h2>

      <nav className="admin-tabs" aria-label={t("admin.subscribers")}>
        {STATUSES.map((name) => (
          <button
            key={name}
            type="button"
            className="admin-tab"
            data-active={name === status ? "" : undefined}
            aria-current={name === status ? "true" : undefined}
            onClick={() => setStatus(name)}
          >
            {t(STATUS_LABEL[name])}
            <span className="admin-tab-count">{counts[name] ?? 0}</span>
          </button>
        ))}
      </nav>

      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}

      {subscribers === null ? (
        <p className="admin-empty">{t("admin.loading")}</p>
      ) : subscribers.length === 0 ? (
        <p className="admin-empty">{t("admin.noSubscribers")}</p>
      ) : (
        <ul className="admin-newsletter-list">
          {subscribers.map((subscriber) => (
            <li key={subscriber.id} className="admin-newsletter-item">
              <span className="admin-newsletter-email">
                {subscriber.emailMasked}
              </span>
              <span className="admin-badge admin-badge--muted">
                {t(STATUS_LABEL[subscriber.status])}
              </span>
              <time dateTime={subscriber.createdAt}>
                {t("admin.joined")}:{" "}
                {formatDate(new Date(subscriber.createdAt), lang)}
              </time>
            </li>
          ))}
        </ul>
      )}

      <form
        className="admin-newsletter-form"
        onSubmit={(event) => {
          event.preventDefault();
          void sendNewsletter();
        }}
      >
        <label htmlFor="newsletter-subject">{t("admin.subject")}</label>
        <input
          id="newsletter-subject"
          type="text"
          maxLength={200}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
        <label htmlFor="newsletter-body">{t("admin.bodyHtml")}</label>
        <textarea
          id="newsletter-body"
          rows={8}
          maxLength={20000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        <button
          type="submit"
          className="admin-action admin-action--primary"
          disabled={sending || subject.trim() === "" || body.trim() === ""}
        >
          {sending ? t("admin.sending") : t("admin.send")}
        </button>
        {sendResult ? (
          <p className="admin-newsletter-result" role="status">
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
