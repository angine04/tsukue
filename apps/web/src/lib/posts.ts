import { getCollection, type CollectionEntry } from "astro:content";
import {
  AUTHOR_NAME,
  AUTHOR_ROLE,
  DEFAULT_ROUTE_CONFIG,
  SITE_URL,
  SUPPORTED_LANGS,
  aboutPath,
  aboutSegments,
  homePath,
  localeSegments,
  postPath,
} from "@tsukue/config";
import { DEFAULT_CARD, type Post } from "@tsukue/types";
import { seededRotation, type DeskArticle, type DeskItem } from "./cards";
import { findContentIssues } from "./content-validation";

export type PostEntry = CollectionEntry<"posts">;

export interface AlternateLink {
  hreflang: string;
  href: string;
}

/**
 * Every published post, newest first. Drafts are dropped from production
 * builds and kept in dev so they can be previewed.
 */
export async function loadPosts(): Promise<PostEntry[]> {
  const includeDrafts = !import.meta.env.PROD;
  const entries = await getCollection(
    "posts",
    ({ data }) => includeDrafts || !data.draft,
  );

  const issues = findContentIssues(entries, { includeDrafts });
  if (issues.length > 0) {
    const detail = issues
      .map((issue) => `  - ${issue.id}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Content validation failed with ${issues.length} problem(s):\n${detail}`,
    );
  }

  return [...entries].sort((a, b) => {
    const delta = b.data.date.valueOf() - a.data.date.valueOf();
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  });
}

/** Serializable article metadata, safe to hand to a React island. */
export function toPostMeta(entry: PostEntry): Post {
  const { data } = entry;
  return {
    slug: data.slug,
    lang: data.lang,
    translationKey: data.translationKey,
    title: data.title,
    description: data.description,
    date: data.date,
    updated: data.updated,
    draft: data.draft,
    tags: data.tags,
    card: data.card
      ? {
          ...DEFAULT_CARD,
          ...data.card,
          rotation: data.card.rotation ?? DEFAULT_CARD.rotation,
        }
      : undefined,
    translation: data.translation,
  };
}

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).href;
}

/**
 * Turns posts for one language into the cards the desk renders. The About card
 * is appended so it sits at the end of the rail as a name card, and it always
 * points at the default language's About page — localized About routes are
 * deferred until they have real content.
 */
export function buildDeskItems(
  entries: readonly PostEntry[],
  lang: string,
): DeskItem[] {
  const articles: DeskArticle[] = entries
    .filter((entry) => entry.data.lang === lang)
    .map((entry) => {
      const meta = toPostMeta(entry);
      const card = meta.card ?? DEFAULT_CARD;
      return {
        kind: "article",
        href: postPath(entry.data),
        slug: entry.data.slug,
        lang: meta.lang,
        title: meta.title,
        description: meta.description,
        eyebrow: (meta.tags[0] ?? card.kind).toUpperCase(),
        dateLabel: formatPostDate(meta.date, meta.lang),
        color: card.color,
        variant: card.variant,
        accent: card.accent,
        // An author-pinned angle wins; otherwise the id seeds a stable one.
        rotation: entry.data.card?.rotation ?? seededRotation(entry.id),
      };
    });

  return [
    ...articles,
    {
      kind: "about",
      href: aboutPath(),
      name: AUTHOR_NAME,
      role: AUTHOR_ROLE,
      rotation: seededRotation("about"),
    },
  ];
}

export interface ArticleRoute {
  kind: "article";
  path: string;
  entry: PostEntry;
  meta: Post;
}

export interface AboutRoute {
  kind: "about";
  path: string;
  lang: string;
}

export type ContentRoute = ArticleRoute | AboutRoute;

/**
 * Every content URL the site publishes. The catch-all route and the sitemap
 * both read from here so they cannot drift apart.
 *
 * The About sheet is generated for the default language only; localized About
 * pages are intentionally deferred until they have real content.
 */
export function listContentRoutes(
  entries: readonly PostEntry[],
): ContentRoute[] {
  const aboutLang = DEFAULT_ROUTE_CONFIG.defaultLang;
  return [
    ...entries.map((entry) => ({
      kind: "article" as const,
      path: postPath(entry.data),
      entry,
      meta: toPostMeta(entry),
    })),
    {
      kind: "about" as const,
      path: `/${aboutSegments(aboutLang).join("/")}`,
      lang: aboutLang,
    },
  ];
}

/**
 * Languages that are both locale-prefixed and actually have posts. A localized
 * home with nothing on it would be a thin page, so one is only built once the
 * language has content.
 */
export function listLocalizedLangs(entries: readonly PostEntry[]): string[] {
  const langsWithPosts = new Set(entries.map((entry) => entry.data.lang));
  return SUPPORTED_LANGS.filter(
    (lang) => localeSegments(lang).length > 0 && langsWithPosts.has(lang),
  );
}

export function listHomePaths(entries: readonly PostEntry[]): string[] {
  return [
    ...new Set([
      homePath(),
      ...listLocalizedLangs(entries).map((lang) => homePath(lang)),
    ]),
  ];
}

/** hreflang links for every language version of this post, plus x-default. */
export function buildAlternates(
  entry: PostEntry,
  all: readonly PostEntry[],
): AlternateLink[] {
  const group = all.filter(
    (candidate) => candidate.data.translationKey === entry.data.translationKey,
  );

  const links = group.map((candidate) => ({
    hreflang: candidate.data.lang,
    href: absoluteUrl(postPath(candidate.data)),
  }));

  const fallback = group.find(
    (candidate) => candidate.data.lang === DEFAULT_ROUTE_CONFIG.defaultLang,
  );
  if (fallback) {
    links.push({
      hreflang: "x-default",
      href: absoluteUrl(postPath(fallback.data)),
    });
  }

  return links.sort((a, b) => a.hreflang.localeCompare(b.hreflang));
}

/**
 * Rendered in UTC so a post dated `2026-05-28` reads as the 28th everywhere,
 * rather than shifting a day for readers behind the build machine.
 */
export function formatPostDate(date: Date, lang: string): string {
  return new Intl.DateTimeFormat(lang, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
}
