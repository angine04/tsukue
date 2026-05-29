import { z } from "zod";

export const CommentStatus = z.enum([
  "pending",
  "approved",
  "hidden",
  "deleted",
  "spam",
]);

export type CommentStatus = z.infer<typeof CommentStatus>;

export const CommentSchema = z.object({
  id: z.string(),
  slug: z.string(),
  lang: z.string().optional(),
  parentId: z.string().optional(),
  authorName: z.string().min(1).max(80),
  authorEmailHash: z.string().optional(),
  authorEmailEncrypted: z.string().optional(),
  body: z.string().min(1).max(4000),
  status: CommentStatus.default("pending"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().optional(),
  ipHash: z.string().optional(),
  userAgentHash: z.string().optional(),
});

export type Comment = z.infer<typeof CommentSchema>;

export const CreateCommentSchema = z.object({
  slug: z.string().min(1),
  lang: z.string().optional(),
  parentId: z.string().optional(),
  authorName: z.string().min(1).max(80),
  authorEmail: z.string().email().optional(),
  body: z.string().min(1).max(4000),
  turnstileToken: z.string().min(1),
});

export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

export const CommentQuerySchema = z.object({
  slug: z.string().min(1),
  lang: z.string().optional(),
});

export type CommentQuery = z.infer<typeof CommentQuerySchema>;
