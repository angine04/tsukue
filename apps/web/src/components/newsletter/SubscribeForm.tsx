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

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
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
    <form className="mt-8 flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-[0.35rem]">
        <label
          className="font-sans text-[0.85rem] text-ink"
          htmlFor="newsletter-email"
        >
          {t("newsletter.emailLabel")}
        </label>
        {/* The sheet is a light surface; the browser's dark form styling would fight it. */}
        <input
          id="newsletter-email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          className="w-full border border-line-strong bg-[color-mix(in_srgb,var(--color-paper-ivory)_80%,#fff)] px-[0.7rem] py-[0.6rem] font-sans text-[0.95rem] text-ink rounded-[2px] scheme-light focus-visible:outline-offset-2"
        />
      </div>

      <div ref={containerRef} />

      <button
        type="submit"
        className="self-start rounded-[2px] border-0 bg-accent px-[1.4rem] py-[0.55rem] font-sans text-[0.95rem] text-paper-ivory cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-offset-2"
        disabled={sending || !token}
      >
        {sending ? t("newsletter.sending") : t("newsletter.subscribe")}
      </button>

      <p className="font-sans text-[0.8rem] text-muted">
        {t("newsletter.hint")}
      </p>

      {message ? (
        <p
          className="font-sans text-[0.88rem] data-[status=pending]:text-accent data-[status=error]:text-accent"
          data-status={status}
          role={status === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
