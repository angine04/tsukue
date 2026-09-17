export type CardKind = "article" | "about" | "note";
export type CardColor =
  | "ivory"
  | "sand"
  | "olive"
  | "terracotta"
  | "warm-paper";
export type CardVariant = "wide" | "compact" | "name-card";
export type CardAccent = "brown" | "rust" | "forest" | "slate";

export interface CardMeta {
  kind: CardKind;
  color: CardColor;
  variant: CardVariant;
  rotation: number;
  accent: CardAccent;
}

export const DEFAULT_CARD: Readonly<CardMeta> = {
  kind: "article",
  color: "ivory",
  variant: "wide",
  rotation: 0,
  accent: "brown",
} as const;

export type TranslationStatus = "human" | "machine" | "mixed";

export interface PostTranslation {
  sourceLang?: string;
  status?: TranslationStatus;
}

export interface Post {
  slug: string;
  lang: string;
  translationKey: string;
  title: string;
  description: string;
  date: Date;
  updated?: Date;
  draft: boolean;
  tags: string[];
  card?: CardMeta;
  translation?: PostTranslation;
}

export interface PostCollection {
  posts: Post[];
}
