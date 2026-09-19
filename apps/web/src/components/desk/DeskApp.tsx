import { AnimatePresence, MotionConfig } from "framer-motion";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { homePath, postPartialPath } from "@tsukue/config";
import { cardLayoutId, type DeskArticle, type DeskItem } from "../../lib/cards";
import { useI18n } from "../../hooks/useI18n";
import Comments from "../comments/Comments";
import DeskHeader from "./DeskHeader";
import DeskRail from "./DeskRail";
import Sheet from "./Sheet";

/**
 * The sheet is the only thing that adds to the desk, so it is the only mode
 * that needs a shape. `opening` exists so the fragment fetch has a state that
 * is neither the desk nor the article: the rail stays live instead of an empty
 * overlay flashing over it. Closing needs no state of its own — the exit
 * animation belongs to AnimatePresence, which runs it when the sheet unmounts.
 */
type DeskMode =
  | { type: "desk" }
  | { type: "opening"; slug: string; lang: string }
  | {
      type: "article";
      slug: string;
      lang: string;
      html: string;
      /** Presented rather than animated; see Sheet. */
      instant: boolean;
    }
  | { type: "about"; lang: string; html: string; instant: boolean };

interface DeskAppProps {
  items: DeskItem[];
  lang?: string;
  /**
   * Set by the content routes: the page was loaded *on* this sheet, so the desk
   * opens with it up rather than offering a card to click.
   */
  initialSheet?: { kind: "article" | "about"; slug?: string; lang: string };
  /**
   * Public Turnstile site key, resolved at build time. Empty means the comment
   * form is replaced by a notice rather than a form that cannot submit.
   */
  turnstileSiteKey?: string;
}

/** The server-rendered sheet a content route ships for readers without JS. */
const FALLBACK_SELECTOR = "[data-sheet-fallback]";
const SHEET_BODY_SELECTOR = ".sheet-body";

/**
 * Astro serves these routes from `index.html`, so whether a trailing slash
 * arrives depends on the host. Both sides are normalised before comparing.
 */
function normalisePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

/**
 * Which article, if any, the current URL names.
 *
 * The URL is the only thing consulted, deliberately. History state looks like
 * the natural place to record "an article is open", but it is not guaranteed
 * to be present or current — a reload, a restored entry or a host that
 * rewrites the path all lose it — and a stale copy of it is worse than none:
 * a close that read it re-opened the article it had just dismissed. The URL
 * cannot disagree with itself.
 */
function articleAtPath(
  items: readonly DeskItem[],
  pathname: string,
): DeskArticle | undefined {
  const target = normalisePath(pathname);
  return items.find(
    (item): item is DeskArticle =>
      item.kind === "article" && normalisePath(item.href) === target,
  );
}

/**
 * The article's own title, for naming its dialog. A dialog called "Back" tells
 * a screen reader nothing about what opened.
 */
function articleTitle(
  items: readonly DeskItem[],
  article: { slug: string; lang: string },
): string | undefined {
  return items.find(
    (item): item is DeskArticle =>
      item.kind === "article" &&
      item.slug === article.slug &&
      item.lang === article.lang,
  )?.title;
}

export default function DeskApp({
  items,
  lang = "en",
  initialSheet,
  turnstileSiteKey = "",
}: DeskAppProps) {
  const { t } = useI18n(lang);

  // Landing on a sheet starts focused on the card it belongs to, so the rail is
  // already where the sheet is rather than sliding there once it appears.
  const [focusedIndex, setFocusedIndex] = useState(() => {
    if (!initialSheet) return 0;
    const index = items.findIndex((item) =>
      initialSheet.kind === "about"
        ? item.kind === "about"
        : item.kind === "article" &&
          item.slug === initialSheet.slug &&
          item.lang === initialSheet.lang,
    );
    return index > 0 ? index : 0;
  });
  const [mode, setMode] = useState<DeskMode>({ type: "desk" });

  /**
   * True while the current history entry is one this session pushed for an
   * article. Closing needs to know, because the two cases have opposite
   * correct answers: with an entry of ours behind us, Back is the collapse;
   * loaded straight onto the article, there is nothing of ours to back out of
   * and Back would leave the site.
   */
  const pushedArticleRef = useRef(false);

  /**
   * The sheet shows what the article route already renders at build time, so
   * the fragment is fetched rather than every post being serialised into the
   * page. A failed fetch navigates instead of falling back to something
   * simpler: the destination renders identically, so there is nothing to fall
   * back *to* and a half-styled copy would only be worse.
   */
  const loadArticle = useCallback(async (item: DeskArticle) => {
    setMode({ type: "opening", slug: item.slug, lang: item.lang });

    try {
      const response = await fetch(postPartialPath(item));
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      // Take the article out of the response rather than trusting the whole
      // body. Production serves a bare fragment, but the dev server injects its
      // client scripts into every page, and a fragment that carries them would
      // differ between the two. InnerHTML never executes injected scripts, so
      // this is about the markup being what it claims, not about safety.
      const document_ = new DOMParser().parseFromString(
        await response.text(),
        "text/html",
      );
      const article = document_.querySelector("article");
      if (!article) {
        throw new Error(`Partial for ${item.href} contained no <article>.`);
      }

      setMode({
        type: "article",
        slug: item.slug,
        lang: item.lang,
        html: article.outerHTML,
        instant: false,
      });
    } catch (error) {
      console.error(
        `Could not load ${item.href} as a fragment; navigating instead.`,
        error,
      );
      window.location.assign(item.href);
    }
  }, []);

  const openArticle = useCallback(
    (item: DeskArticle) => {
      void loadArticle(item);
      // No state: the URL already says which article is open, and a second
      // copy of that fact is one more thing that can go stale.
      window.history.pushState(null, "", item.href);
      pushedArticleRef.current = true;
    },
    [loadArticle],
  );

  /**
   * Closing collapses back to the desk.
   *
   * With an entry of ours behind us that is Back, and pushing a home entry
   * instead would leave the sheet in the history for the reader's own Back
   * button to re-open. On a page loaded straight onto a sheet there is no such
   * entry — Back would leave the site — so a home entry is pushed instead and
   * the reader is left somewhere truthful. The About sheet is always reached by
   * navigating, so it always takes that second path.
   */
  const closeSheet = useCallback(() => {
    setMode({ type: "desk" });

    if (pushedArticleRef.current) {
      pushedArticleRef.current = false;
      window.history.back();
      return;
    }

    window.history.pushState(null, "", homePath(lang));
  }, [lang]);

  /**
   * Back and Forward are the only things that reopen a sheet, so the desk
   * never fights the reader's own history. This loads without pushing, or
   * Back would re-enter the entry it just left.
   */
  useEffect(() => {
    const handlePopState = () => {
      // Read the URL, not `event.state`: Back and Forward are the same event
      // with different payloads, and the URL is the one both agree on.
      const item = articleAtPath(items, window.location.pathname);
      // Landing on an article by traversal puts an entry of ours behind the
      // reader again, so closing goes back out of it. Landing on the home URL
      // leaves nothing to back out of.
      pushedArticleRef.current = Boolean(item);

      if (item) {
        void loadArticle(item);
      } else {
        setMode({ type: "desk" });
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [items, loadArticle]);

  const initialKind = initialSheet?.kind;
  const initialSlug = initialSheet?.slug;
  const initialLang = initialSheet?.lang;

  /**
   * Take over the sheet the content route rendered.
   *
   * The route ships the sheet as real markup so the page reads without
   * JavaScript; the island adopts that exact element rather than fetching the
   * same HTML again or serialising the post into the page. This runs before
   * paint and both sheets carry the same classes, so the handover is not
   * visible. `instant` keeps Framer from morphing out of a card for a sheet the
   * reader navigated to rather than opened.
   *
   * Anything inside the adopted markup is server-rendered HTML, so an
   * interactive island in post MDX would be lost here — the same constraint the
   * partial route already carries (AGENTS 7.3).
   */
  useLayoutEffect(() => {
    if (!initialKind) return;
    const fallback = document.querySelector(FALLBACK_SELECTOR);
    if (!fallback) return;
    const body = fallback.querySelector(SHEET_BODY_SELECTOR);
    if (!body) return;

    fallback.remove();

    if (initialKind === "about") {
      setMode({
        type: "about",
        lang: initialLang ?? lang,
        html: body.innerHTML,
        instant: true,
      });
      return;
    }

    setMode({
      type: "article",
      slug: initialSlug ?? "",
      lang: initialLang ?? lang,
      html: body.innerHTML,
      instant: true,
    });
  }, [initialKind, initialLang, initialSlug, lang]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const open = mode.type === "article" || mode.type === "about";
      if (event.key === "Escape" && open) {
        event.preventDefault();
        closeSheet();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeSheet, mode.type]);

  const handleOpenArticle = useCallback(
    (item: DeskItem) => {
      if (item.kind === "article") openArticle(item);
    },
    [openArticle],
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="desk desk-app">
        <DeskHeader lang={lang} />
        <DeskRail
          items={items}
          lang={lang}
          focusedIndex={focusedIndex}
          onFocusIndex={setFocusedIndex}
          onOpenArticle={handleOpenArticle}
          expandedLayoutId={
            mode.type === "article" ? cardLayoutId(mode) : undefined
          }
        />
        <AnimatePresence>
          {mode.type === "article" && (
            <Sheet
              html={mode.html}
              label={articleTitle(items, mode) ?? t("article.back")}
              backLabel={t("article.back")}
              layoutId={mode.instant ? undefined : cardLayoutId(mode)}
              instant={mode.instant}
              onClose={closeSheet}
            >
              {/*
                Comments belong to the article, not to the desk, so they live
                inside the sheet and travel with it. Keyed by slug so switching
                articles cannot show the previous thread while the next loads.
              */}
              <Comments
                key={`${mode.slug}-${mode.lang}`}
                slug={mode.slug}
                lang={mode.lang}
                siteKey={turnstileSiteKey}
              />
            </Sheet>
          )}
          {mode.type === "about" && (
            <Sheet
              html={mode.html}
              label={t("nav.about")}
              backLabel={t("nav.back")}
              instant={mode.instant}
              onClose={closeSheet}
            />
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
