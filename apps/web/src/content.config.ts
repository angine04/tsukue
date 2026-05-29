import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.string().datetime(),
    updated: z.string().datetime().optional(),
    lang: z.string(),
    translationKey: z.string(),
    slug: z.string(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).optional(),
    card: z
      .object({
        kind: z.string().optional(),
        color: z.string().optional(),
        variant: z.string().optional(),
        rotation: z.number().optional(),
        accent: z.string().optional(),
      })
      .optional(),
    translation: z
      .object({
        sourceLang: z.string().optional(),
        status: z.string().optional(),
      })
      .optional(),
  }),
});

export const collections = { posts };
