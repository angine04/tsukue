import { useState } from "react";
import { useI18n } from "../../hooks/useI18n";
import { useTurnstile } from "../../hooks/useTurnstile";

interface CommentFormProps {
  slug: string;
  lang: string;
  /** Public Turnstile site key. Comments are closed without one. */
  siteKey: string;
}

type Status = "idle" | "sending" | "posted" | "error";

export default function CommentForm({ slug, lang, siteKey }: CommentFormProps) {
  const { t } = useI18n(lang);
  const { containerRef, token, reset } = useTurnstile(siteKey);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    setStatus("sending");
    setMessage("");

    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          lang,
          authorName: String(data.get("authorName") ?? ""),
          authorEmail: String(data.get("authorEmail") ?? "") || undefined,
          body: String(data.get("body") ?? ""),
          // The honeypot. A person never sees this field, so anything in it is
          // a bot; the server discards it and answers exactly as it would a
          // real comment.
          website: String(data.get("website") ?? ""),
          turnstileToken: token,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error: { message: string } }
        | null;

      if (response.ok && payload?.ok) {
        setStatus("posted");
        setMessage(t("comment.posted"));
        form.reset();
      } else {
        setStatus("error");
        // The API's messages are written for the reader and are more specific
        // than anything this component could guess, so they are shown as-is.
        setMessage(
          payload && !payload.ok ? payload.error.message : t("comment.error"),
        );
      }
    } catch {
      setStatus("error");
      setMessage(t("comment.error"));
    }

    // A token is single-use whether or not the submission was accepted.
    reset();
  }

  const sending = status === "sending";

  return (
    <form className="comment-form" onSubmit={handleSubmit}>
      <div className="comment-field">
        <label htmlFor="comment-name">{t("comment.name")}</label>
        <input
          id="comment-name"
          name="authorName"
          type="text"
          required
          maxLength={80}
          autoComplete="name"
        />
      </div>

      <div className="comment-field">
        <label htmlFor="comment-email">
          {t("comment.email")}{" "}
          <span className="comment-field-hint">{t("comment.emailHint")}</span>
        </label>
        <input
          id="comment-email"
          name="authorEmail"
          type="email"
          maxLength={254}
          autoComplete="email"
        />
      </div>

      <div className="comment-field">
        <label htmlFor="comment-body">{t("comment.body")}</label>
        <textarea
          id="comment-body"
          name="body"
          rows={5}
          required
          maxLength={4000}
          placeholder={t("comment.placeholder")}
        />
      </div>

      {/*
        The honeypot. Hidden from people and from assistive technology, and
        named to look like an ordinary field to anything scraping the form.
      */}
      <div className="comment-honeypot" aria-hidden="true">
        <label htmlFor="comment-website">Website</label>
        <input
          id="comment-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="comment-turnstile" ref={containerRef} />

      <button
        type="submit"
        className="comment-submit"
        disabled={sending || !token}
      >
        {t("comment.submit")}
      </button>

      {message ? (
        <p
          className="comment-status"
          data-status={status}
          role={status === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
