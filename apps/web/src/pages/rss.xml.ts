import type { APIRoute } from "astro";
import {
  DEFAULT_ROUTE_CONFIG,
  SITE_DESCRIPTION,
  SITE_NAME,
  postSegments,
} from "@tsukue/config";
import { absoluteUrl, loadPosts, toPostMeta } from "../lib/posts";
import { escapeXml } from "../lib/xml";

const FEED_PATH = "/rss.xml";

// Feed is default-language only for now; extending it to every language would
// need per-language feeds rather than mixed-language items.
export const GET: APIRoute = async () => {
  const entries = await loadPosts();
  const items = entries
    .filter((entry) => entry.data.lang === DEFAULT_ROUTE_CONFIG.defaultLang)
    .map((entry) => {
      const meta = toPostMeta(entry);
      const url = absoluteUrl(`/${postSegments(entry.data).join("/")}`);
      return [
        "    <item>",
        `      <title>${escapeXml(meta.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <description>${escapeXml(meta.description)}</description>`,
        `      <pubDate>${meta.date.toUTCString()}</pubDate>`,
        ...meta.tags.map(
          (tag) => `      <category>${escapeXml(tag)}</category>`,
        ),
        "    </item>",
      ].join("\n");
    });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(SITE_NAME)}</title>`,
    `    <link>${escapeXml(absoluteUrl("/"))}</link>`,
    `    <description>${escapeXml(SITE_DESCRIPTION)}</description>`,
    `    <language>${DEFAULT_ROUTE_CONFIG.defaultLang}</language>`,
    `    <atom:link href="${escapeXml(absoluteUrl(FEED_PATH))}" rel="self" type="application/rss+xml" />`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");

  return new Response(xml, {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
};
