import type { CardAccent, CardColor, CardVariant } from "@tsukue/types";

/**
 * Angles the desk scatters its cards across, in degrees. Frontmatter may pin a
 * rotation; otherwise a stable per-post angle is derived from the post id so a
 * rebuild never reshuffles the desk.
 */
const ROTATION_SPREAD = 7;

export function seededRotation(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  // FNV alone keeps similar ids correlated ("en/post-1", "en/post-2"), which
  // shows up as a desk of near-identical angles. Finalise before scaling.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x2545f491);
  hash ^= hash >>> 15;

  const unit = (hash >>> 0) / 0xffffffff;
  return Math.round((unit * 2 - 1) * ROTATION_SPREAD * 100) / 100;
}

/**
 * View models handed to the desk island. Dates and labels are resolved on the
 * server so the island renders identical markup on both sides of hydration.
 */
export interface DeskArticle {
  kind: "article";
  href: string;
  slug: string;
  lang: string;
  title: string;
  description: string;
  eyebrow: string;
  dateLabel: string;
  color: CardColor;
  variant: CardVariant;
  accent: CardAccent;
  rotation: number;
}

export interface DeskAbout {
  kind: "about";
  href: string;
  name: string;
  role: string;
  rotation: number;
}

export type DeskItem = DeskArticle | DeskAbout;

/**
 * The identity a card and its sheet share. Framer promotes the entering
 * element over the leaving one by matching on this, so both sides must build
 * it from the same post — never from a URL, which changes shape with the
 * route config.
 */
export function cardLayoutId(item: { slug: string; lang: string }): string {
  return `card-${item.slug}-${item.lang}`;
}
