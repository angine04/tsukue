import { useCallback, useEffect, useRef, useState } from "react";

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
 * third-party resource, and the forms that need it sit below an article the
 * reader may never scroll to. Until they reach one, nothing is requested from
 * Cloudflare.
 *
 * A token is single-use. `reset` is returned so the caller can obtain a fresh
 * one after a submission; without it the second comment from the same reader
 * would be rejected as a duplicate token.
 *
 * Shared by the comment form and the newsletter form — the two places a reader
 * can prove they are a person, which is the only thing this hook knows about.
 */
export function useTurnstile(siteKey: string) {
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
