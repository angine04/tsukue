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
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
  schema: z
    .object({
      title: z.string(),
      description: z.string(),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      lang: z.string(),
      translationKey: z.string(),
      slug: z.string(),
      draft: z.boolean().default(false),
      tags: z.array(z.string()).default([]),
      card: z
        .object({
          kind: CardKind.default("article"),
          color: CardColor.default("ivory"),
          variant: CardVariant.default("wide"),
          rotation: z.number().min(-5).max(5).default(0),
          accent: CardAccent.default("brown"),
        })
        .optional(),
      translation: z
        .object({
          sourceLang: z.string().optional(),
          status: z.enum(["human", "machine", "mixed"]).optional(),
        })
        .optional(),
    })
    .strict(),
});

export const collections = { posts };
