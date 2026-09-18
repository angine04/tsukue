import { AnimatePresence, MotionConfig } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import type { DeskItem } from "../../lib/cards";
import ArticleSheet from "./ArticleSheet";
import DeskHeader from "./DeskHeader";
import DeskRail from "./DeskRail";

type DeskMode =
  | { type: "desk" }
  | { type: "opening"; slug: string; lang: string }
  | { type: "article"; slug: string; lang: string; html: string }
  | { type: "closing"; slug: string; lang: string };

interface DeskAppProps {
  items: DeskItem[];
  lang?: string;
}

export default function DeskApp({ items, lang = "en" }: DeskAppProps) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [mode, setMode] = useState<DeskMode>({ type: "desk" });

  const handleOpenArticle = useCallback(async (item: DeskItem) => {
    if (item.kind !== "article") return;

    // Extract slug from href: "/slug" or "/zh-Hans/slug" -> "slug"
    const slug = item.href.split("/").filter(Boolean).pop() ?? "";

    setMode({ type: "opening", slug, lang: item.lang });

    try {
      // Fetch the partial
      const partialPath =
        item.lang === "en"
          ? `/partials/${slug}`
          : `/${item.lang}/partials/${slug}`;

      const response = await fetch(partialPath);
      if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`);

      const html = await response.text();

      // Extract just the article content, stripping dev toolbar
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const article = doc.querySelector("article");
      const articleHTML = article?.outerHTML ?? html;

      setMode({ type: "article", slug, lang: item.lang, html: articleHTML });

      // Update URL without navigation
      window.history.pushState(
        { mode: "article", slug, lang: item.lang },
        "",
        item.href,
      );
    } catch (error) {
      console.error("Failed to load article:", error);
      // Fall back to desk mode on error
      setMode({ type: "desk" });
    }
  }, []);

  const handleCloseArticle = useCallback(() => {
    if (mode.type !== "article") return;

    setMode({ type: "closing", slug: mode.slug, lang: mode.lang });

    // Navigate back to desk
    const homePath = lang === "en" ? "/" : `/${lang}`;
    window.history.pushState({ mode: "desk" }, "", homePath);

    // Complete the close transition
    setTimeout(() => {
      setMode({ type: "desk" });
    }, 300); // Match the animation duration
  }, [mode, lang]);

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state?.mode === "article") {
        // Re-fetch the article (or we could cache it)
        const item = items.find(
          (i) => i.kind === "article" && i.href === window.location.pathname,
        );
        if (item && item.kind === "article") {
          handleOpenArticle(item);
        }
      } else {
        // Return to desk
        setMode({ type: "desk" });
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [items, handleOpenArticle]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && mode.type === "article") {
        event.preventDefault();
        handleCloseArticle();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, handleCloseArticle]);

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
        />
        <AnimatePresence>
          {mode.type === "article" && (
            <ArticleSheet
              slug={mode.slug}
              html={mode.html}
              lang={mode.lang}
              onClose={handleCloseArticle}
            />
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
