export type PostRouteMode = "flat" | "prefixed";

export type LocaleRouteMode =
  | "flat-default-lang"
  | "prefixed-all"
  | "prefixed-non-default";

export interface RouteConfig {
  postMode: PostRouteMode;
  localeMode: LocaleRouteMode;
  defaultLang: string;
}

export const RESERVED_SLUGS = new Set([
  "about",
  "admin",
  "api",
  "partials",
  "data",
  "rss.xml",
  "sitemap.xml",
  "feed",
  "tags",
  "archive",
  "search",
  "assets",
  "robots.txt",
]);

export const DEFAULT_ROUTE_CONFIG: RouteConfig = {
  postMode: "flat",
  localeMode: "flat-default-lang",
  defaultLang: "en",
};

export const POST_SEGMENT = "posts";
export const PARTIAL_SEGMENT = "partials";
export const ABOUT_SEGMENT = "about";

/**
 * Locale segments to prepend for a given language.
 *
 * `flat-default-lang` and `prefixed-non-default` both serve the default
 * language flat and prefix every other language; `prefixed-all` prefixes
 * every language including the default.
 */
export function localeSegments(
  lang: string,
  config: RouteConfig = DEFAULT_ROUTE_CONFIG,
): string[] {
  if (config.localeMode === "prefixed-all") {
    return [lang];
  }
  return lang === config.defaultLang ? [] : [lang];
}

function joinPath(segments: string[]): string {
  return `/${segments.filter(Boolean).join("/")}`;
}

export function postSegments(
  post: { slug: string; lang: string },
  config: RouteConfig = DEFAULT_ROUTE_CONFIG,
): string[] {
  const segments = localeSegments(post.lang, config);
  if (config.postMode === "prefixed") {
    segments.push(POST_SEGMENT);
  }
  segments.push(post.slug);
  return segments;
}

export function postPath(
  post: { slug: string; lang: string },
  config: RouteConfig = DEFAULT_ROUTE_CONFIG,
): string {
  return joinPath(postSegments(post, config));
}

/**
 * Partial routes keep the locale prefix in front of the reserved `partials`
 * segment, so a locale-prefixed article at `/zh-Hans/on-slowness` has its
 * fragment at `/zh-Hans/partials/on-slowness`.
 */
export function postPartialSegments(
  post: { slug: string; lang: string },
  config: RouteConfig = DEFAULT_ROUTE_CONFIG,
): string[] {
  return [...localeSegments(post.lang, config), PARTIAL_SEGMENT, post.slug];
}

export function postPartialPath(
  post: { slug: string; lang: string },
  config: RouteConfig = DEFAULT_ROUTE_CONFIG,
): string {
  return joinPath(postPartialSegments(post, config));
}

export function aboutSegments(
  lang?: string,
  config: RouteConfig = DEFAULT_ROUTE_CONFIG,
): string[] {
  return [...localeSegments(lang ?? config.defaultLang, config), ABOUT_SEGMENT];
}

export function aboutPath(
  lang?: string,
  config: RouteConfig = DEFAULT_ROUTE_CONFIG,
): string {
  return joinPath(aboutSegments(lang, config));
}

export function homePath(
  lang?: string,
  config: RouteConfig = DEFAULT_ROUTE_CONFIG,
): string {
  return joinPath(localeSegments(lang ?? config.defaultLang, config));
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

/**
 * The shape a post slug must have.
 *
 * Exported so the comment API can reject anything the router could not have
 * produced, instead of keeping a second opinion about what a slug looks like
 * that would drift from this one. It also keeps newline characters and
 * unbounded lengths out of anything downstream that treats a slug as a label —
 * a mail subject, for instance.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Generous next to any real slug, and small enough to bound what gets stored. */
export const SLUG_MAX_LENGTH = 128;

export function validateSlug(slug: string): string | undefined {
  if (isReservedSlug(slug)) {
    return `Slug "${slug}" is reserved and cannot be used for a post.`;
  }
  if (slug.length > SLUG_MAX_LENGTH) {
    return `Slug "${slug.slice(0, 32)}…" is longer than ${SLUG_MAX_LENGTH} characters.`;
  }
  if (!SLUG_PATTERN.test(slug)) {
    return `Slug "${slug}" must be kebab-case (lowercase letters, numbers, hyphens only).`;
  }
  return undefined;
}
