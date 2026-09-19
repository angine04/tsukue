import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../hooks/useI18n";

const TURNSTILE_SCRIPT =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

function turnstileApi(): TurnstileApi | undefined {
  return (window as { turnstile?: TurnstileApi }).turnstile;
}

/**
 * Loads Turnstile once and renders one widget.
 *
 * The script is fetched on demand rather than in the page head: it is a
 * third-party resource, and the comments form is below an article the reader
 * may never scroll to. Until they do, nothing is requested from Cloudflare.
 *
 * A token is single-use. `reset` is returned so the caller can obtain a fresh
 * one after a submission; without it the second comment from the same reader
 * would be rejected as a duplicate token.
 */
function useTurnstile(siteKey: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const [token, setToken] = useState("");

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    const render = () => {
      const api = turnstileApi();
      if (cancelled || !api || !containerRef.current || widgetRef.current)
        return;
      widgetRef.current = api.render(containerRef.current, {
        sitekey: siteKey,
        callback: (value) => {
          if (!cancelled) setToken(value);
        },
        "expired-callback": () => {
          if (!cancelled) setToken("");
        },
        "error-callback": () => {
          if (!cancelled) setToken("");
        },
      });
    };

    let script = document.querySelector<HTMLScriptElement>(
      "script[data-turnstile]",
    );
    if (!script) {
      script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT;
      script.async = true;
      script.defer = true;
      script.dataset.turnstile = "";
      document.head.append(script);
    }
    script.addEventListener("load", render);
    // The script may already have loaded for a previous mount.
    render();

    return () => {
      cancelled = true;
      script?.removeEventListener("load", render);
      if (widgetRef.current) turnstileApi()?.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [siteKey]);

  const reset = useCallback(() => {
    setToken("");
    if (widgetRef.current) turnstileApi()?.reset(widgetRef.current);
  }, []);

  return { containerRef, token, reset };
}

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
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
          // a bot; the server files it as spam and answers exactly as it would
          // a real comment.
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
