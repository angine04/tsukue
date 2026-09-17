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

export function postPath(post: { slug: string; lang: string }): string {
  const config = DEFAULT_ROUTE_CONFIG;
  if (config.postMode === "flat" && post.lang === config.defaultLang) {
    return `/${post.slug}`;
  }
  if (config.localeMode === "prefixed-all") {
    return `/${post.lang}/${post.slug}`;
  }
  if (
    config.localeMode === "prefixed-non-default" &&
    post.lang !== config.defaultLang
  ) {
    return `/${post.lang}/${post.slug}`;
  }
  return `/${post.slug}`;
}

export function postPartialPath(post: { slug: string; lang: string }): string {
  const base = postPath(post);
  if (base.startsWith("/")) {
    return `/partials${base}`;
  }
  return `/partials/${base}`;
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

export function validateSlug(slug: string): string | undefined {
  if (isReservedSlug(slug)) {
    return `Slug "${slug}" is reserved and cannot be used for a post.`;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return `Slug "${slug}" must be kebab-case (lowercase letters, numbers, hyphens only).`;
  }
  return undefined;
}
export function aboutPath(lang?: string): string {
  const config = DEFAULT_ROUTE_CONFIG;
  if (lang && lang !== config.defaultLang) {
    return `/${lang}/about`;
  }
  return "/about";
}
