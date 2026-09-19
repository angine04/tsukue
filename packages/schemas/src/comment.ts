import { z } from "zod";
import { SLUG_MAX_LENGTH, SLUG_PATTERN, isValidLang } from "@tsukue/config";
import type { CommentStatus as CommentStatusType } from "@tsukue/types";

/**
 * Runtime mirror of `CommentStatus`, asserted against the canonical union in
 * `@tsukue/types`.
 *
 * Only one direction is asserted, and deliberately. A status that exists in the
 * schema but not the type would be written to a column the rest of the code
 * cannot interpret, so `satisfies` rejects it. The other direction — a type
 * member the schema does not list — cannot hurt anyone here, because no request
 * supplies a status: a submission's status is assigned by the server.
 */
export const COMMENT_STATUSES = [
  "pending",
  "approved",
  "hidden",
  "deleted",
  "spam",
] as const satisfies readonly CommentStatusType[];

export const CommentStatus = z.enum(COMMENT_STATUSES);

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
  // Constrained to the shape a post slug actually has, using the same pattern
  // the router validates against. Without this a submission could name a post
  // that cannot exist, carry newlines, or be a megabyte long — and the slug is
  // interpolated into a notification subject, where a newline is a mail header
  // injection rather than a formatting detail.
  slug: z.string().trim().min(1).max(SLUG_MAX_LENGTH).regex(SLUG_PATTERN),
  // An unsupported tag would be stored and then matched by nothing, so it is
  // rejected here rather than accumulating rows no page can show.
  lang: z
    .string()
    .trim()
    .refine(isValidLang, { message: "Unsupported language tag." })
    .optional(),
  parentId: z.string().trim().max(64).optional(),
  // Trimmed before the length checks run, so a name or body of nothing but
  // spaces is rejected rather than stored as a blank comment.
  authorName: z.string().trim().min(1).max(80),
  authorEmail: z.string().trim().email().max(254).optional(),
  body: z.string().trim().min(1).max(4000),
  turnstileToken: z.string().min(1),
});

export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

export const CommentQuerySchema = z.object({
  slug: z.string().min(1),
  lang: z.string().optional(),
});

export type CommentQuery = z.infer<typeof CommentQuerySchema>;
