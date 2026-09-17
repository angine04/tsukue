import type { APIRoute } from "astro";
import {
  absoluteUrl,
  buildAlternates,
  listContentRoutes,
  listHomePaths,
  loadPosts,
  type AlternateLink,
} from "../lib/posts";
import { escapeXml } from "../lib/xml";

function urlEntry(
  loc: string,
  lastmod?: string,
  alternates: AlternateLink[] = [],
): string {
  return [
    "  <url>",
    `    <loc>${escapeXml(loc)}</loc>`,
    ...(lastmod ? [`    <lastmod>${lastmod}</lastmod>`] : []),
    ...alternates.map(
      (alternate) =>
        `    <xhtml:link rel="alternate" hreflang="${escapeXml(alternate.hreflang)}" href="${escapeXml(alternate.href)}" />`,
    ),
    "  </url>",
  ].join("\n");
}

export const GET: APIRoute = async () => {
  const entries = await loadPosts();

  const urls = [
    ...listHomePaths(entries).map((path) => urlEntry(absoluteUrl(path))),
    ...listContentRoutes(entries).map((route) =>
      route.kind === "article"
        ? urlEntry(
            absoluteUrl(route.path),
            (route.meta.updated ?? route.meta.date).toISOString(),
            buildAlternates(route.entry, entries),
          )
        : urlEntry(absoluteUrl(route.path)),
    ),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");

  return new Response(xml, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
};
