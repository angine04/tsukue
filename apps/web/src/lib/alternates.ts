import { DEFAULT_ROUTE_CONFIG, SITE_URL, postPath } from "@tsukue/config";

/**
 * The link-shaped half of the content layer, kept apart from `posts.ts` because
 * that module imports `astro:content` and so cannot be loaded outside a build.
 *
 * The same reason `content-validation.ts` exists: what can be checked without a
 * content layer is worth checking without one, and hreflang grouping is
 * especially worth it — a missing alternate is invisible on the page and wrong
 * for a search engine.
 */
export interface AlternateLink {
  hreflang: string;
  href: string;
}

/** Only what these functions read, so a test does not need a content entry. */
export interface TranslatablePost {
  data: {
    slug: string;
    lang: string;
    translationKey: string;
  };
}

/** Absolute, because every caller is building a URL for a document head. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).href;
}

/** hreflang links for every language version of this post, plus x-default. */
export function buildAlternates(
  entry: TranslatablePost,
  all: readonly TranslatablePost[],
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
