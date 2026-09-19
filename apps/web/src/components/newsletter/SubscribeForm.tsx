import { useState } from "react";
import { useI18n } from "../../hooks/useI18n";
import { useTurnstile } from "../../hooks/useTurnstile";

interface SubscribeFormProps {
  lang?: string;
  /** Public Turnstile site key. The page shows a notice instead without one. */
  siteKey: string;
}

type Status = "idle" | "sending" | "pending" | "error";

export default function SubscribeForm({
  lang = "en",
  siteKey,
}: SubscribeFormProps) {
  const { t } = useI18n(lang);
  const { containerRef, token, reset } = useTurnstile(siteKey);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const sending = status === "sending";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    setStatus("sending");
    setMessage("");

    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(data.get("email") ?? ""),
          turnstileToken: token,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error: { message: string } }
        | null;

      if (response.ok && payload?.ok) {
        setStatus("pending");
        // Not "subscribed": nothing is subscribed until the address owner
        // follows the link that is about to be sent to them.
        setMessage(t("newsletter.pending"));
        form.reset();
      } else {
        setStatus("error");
        setMessage(
          payload && !payload.ok
            ? payload.error.message
            : t("newsletter.error"),
        );
      }
    } catch {
      setStatus("error");
      setMessage(t("newsletter.error"));
    }

    // A token is single-use whether or not the request was accepted.
    reset();
  }

  return (
    <form className="newsletter-form" onSubmit={handleSubmit}>
      <div className="newsletter-field">
        <label htmlFor="newsletter-email">{t("newsletter.emailLabel")}</label>
        <input
          id="newsletter-email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
        />
      </div>

      <div className="newsletter-turnstile" ref={containerRef} />

      <button
        type="submit"
        className="newsletter-submit"
        disabled={sending || !token}
      >
        {sending ? t("newsletter.sending") : t("newsletter.subscribe")}
      </button>

      <p className="newsletter-hint">{t("newsletter.hint")}</p>

      {message ? (
        <p
          className="newsletter-status"
          data-status={status}
          role={status === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
