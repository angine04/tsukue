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
    <form className="mt-8 flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-[0.35rem]">
        <label
          className="font-sans text-[0.85rem] text-ink"
          htmlFor="comment-name"
        >
          {t("comment.name")}
        </label>
        {/*
          The sheet is already a light-on-dark surface; the browser's own dark
          form styling would fight it.
        */}
        <input
          id="comment-name"
          name="authorName"
          type="text"
          required
          maxLength={80}
          autoComplete="name"
          className="w-full border border-line-strong bg-[color-mix(in_srgb,var(--color-paper-ivory)_80%,#fff)] px-[0.7rem] py-[0.6rem] font-sans text-[0.95rem] text-ink rounded-[2px] scheme-light focus-visible:outline-offset-2"
        />
      </div>

      <div className="flex flex-col gap-[0.35rem]">
        <label
          className="font-sans text-[0.85rem] text-ink"
          htmlFor="comment-email"
        >
          {t("comment.email")}{" "}
          <span className="text-[0.78rem] text-muted">
            {t("comment.emailHint")}
          </span>
        </label>
        <input
          id="comment-email"
          name="authorEmail"
          type="email"
          maxLength={254}
          autoComplete="email"
          className="w-full border border-line-strong bg-[color-mix(in_srgb,var(--color-paper-ivory)_80%,#fff)] px-[0.7rem] py-[0.6rem] font-sans text-[0.95rem] text-ink rounded-[2px] scheme-light focus-visible:outline-offset-2"
        />
      </div>

      <div className="flex flex-col gap-[0.35rem]">
        <label
          className="font-sans text-[0.85rem] text-ink"
          htmlFor="comment-body"
        >
          {t("comment.body")}
        </label>
        <textarea
          id="comment-body"
          name="body"
          rows={5}
          required
          maxLength={4000}
          placeholder={t("comment.placeholder")}
          className="w-full resize-y border border-line-strong bg-[color-mix(in_srgb,var(--color-paper-ivory)_80%,#fff)] px-[0.7rem] py-[0.6rem] font-sans text-[0.95rem] text-ink rounded-[2px] scheme-light focus-visible:outline-offset-2"
        />
      </div>

      {/*
        Hidden from sight, from the pointer and from the keyboard, but still
        submitted. `display: none` would be skipped by bots that check for it,
        and `type="hidden"` is skipped by bots that only fill visible fields.

        The honeypot. Hidden from people and from assistive technology, and
        named to look like an ordinary field to anything scraping the form.
      */}
      <div
        className="absolute left-[-9999px] h-px w-px overflow-hidden"
        aria-hidden="true"
      >
        <label htmlFor="comment-website">Website</label>
        <input
          id="comment-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div ref={containerRef} />

      {/*
        Below the tap-target size that a phone needs; the whole control grows
        rather than just its hit area so the two stay the same shape.
      */}
      <button
        type="submit"
        className="self-start rounded-[2px] border-0 bg-accent px-[1.4rem] py-[0.55rem] font-sans text-[0.95rem] text-paper-ivory cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-offset-2 max-[720px]:self-stretch max-[720px]:py-3"
        disabled={sending || !token}
      >
        {t("comment.submit")}
      </button>

      {message ? (
        <p
          className="font-sans text-[0.88rem] text-muted data-[status=error]:text-accent"
          data-status={status}
          role={status === "error" ? "alert" : "status"}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
