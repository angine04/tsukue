import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const CardKind = z.enum(["article", "about", "note"]);
const CardColor = z.enum([
  "ivory",
  "sand",
  "olive",
  "terracotta",
  "warm-paper",
]);
const CardVariant = z.enum(["wide", "compact", "name-card"]);
const CardAccent = z.enum(["brown", "rust", "forest", "slate"]);

const posts = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/posts",
    // The default id generator drops the language folder, so `en/note.mdx`
    // and `zh-Hans/note.mdx` would collide on the id `note`. Keeping the
    // relative path makes ids unique per language and lets validation check
    // that a post lives under the folder matching its frontmatter `lang`.
    generateId: ({ entry }) => entry.replace(/\.(md|mdx)$/, ""),
  }),
  schema: z
    .object({
      title: z.string().min(1),
      description: z.string().min(1),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),

      lang: z.string().min(1),
      translationKey: z.string().min(1),
      slug: z.string().min(1),

      draft: z.boolean().default(false),
      tags: z.array(z.string()).default([]),

      card: z
        .object({
          kind: CardKind.default("article"),
          color: CardColor.default("ivory"),
          variant: CardVariant.default("wide"),
          // Left undefined when the author has not picked a rotation, so the
          // desk can fall back to a stable slug-derived angle.
          rotation: z.number().min(-5).max(5).optional(),
          accent: CardAccent.default("brown"),
        })
        .optional(),

      translation: z
        .object({
          sourceLang: z.string().min(1).optional(),
          status: z.enum(["human", "machine", "mixed"]).optional(),
        })
        .optional(),
    })
    .strict(),
});

export const collections = { posts };
