import { z } from "zod";
import type { SubscriberStatus as SubscriberStatusType } from "@tsukue/types";

/**
 * Runtime mirror of `SubscriberStatus`, asserted against the canonical union in
 * `@tsukue/types`.
 *
 * Same one-directional assertion as `CommentStatus`, for the same reason: a
 * status the schema accepts but the types do not know would be written to a
 * column nothing downstream can interpret. The other direction cannot happen,
 * because no request supplies a status — subscribing sets `pending`, and only
 * the confirm and unsubscribe links move it.
 */
export const SUBSCRIBER_STATUSES = [
  "pending",
  "active",
  "unsubscribed",
  "bounced",
  "complained",
] as const satisfies readonly SubscriberStatusType[];

export const SubscriberStatus = z.enum(SUBSCRIBER_STATUSES);

export type SubscriberStatus = z.infer<typeof SubscriberStatus>;

/** The stored row, mirroring `newsletter_subscribers`. */
export const SubscriberSchema = z.object({
  id: z.string(),
  emailEncrypted: z.string(),
  emailHash: z.string(),
  status: SubscriberStatus.default("pending"),
  confirmToken: z.string().optional(),
  unsubscribeToken: z.string(),
  createdAt: z.string().datetime(),
  confirmedAt: z.string().datetime().optional(),
  unsubscribedAt: z.string().datetime().optional(),
});

export type Subscriber = z.infer<typeof SubscriberSchema>;

/**
 * A subscribe request.
 *
 * The Turnstile token travels with the payload rather than in a header because
 * the widget hands it to the form, and one shape for a submission is easier to
 * reason about than two.
 */
export const SubscribeInputSchema = z.object({
  // Bounded because an address longer than the RFC allows cannot receive mail,
  // and because this value is what the lookup hash is taken from.
  email: z.string().trim().email().max(254),
  turnstileToken: z.string().min(1),
});

export type SubscribeInput = z.infer<typeof SubscribeInputSchema>;

/**
 * Tokens in newsletter links are random base64url values. Keeping a bound at
 * the URL boundary avoids handing an unbounded query value to the store.
 */
export const NewsletterTokenSchema = z.string().min(1).max(128);

export const NewsletterTokenQuerySchema = z.object({
  token: NewsletterTokenSchema,
});

export type NewsletterTokenQuery = z.infer<typeof NewsletterTokenQuerySchema>;

export const UnsubscribeInputSchema = z.object({
  token: NewsletterTokenSchema,
});

export type UnsubscribeInput = z.infer<typeof UnsubscribeInputSchema>;

/**
 * A newsletter about to go to every active subscriber.
 *
 * `body` is the operator's own HTML rather than reader input — the one place in
 * this codebase where markup passes through unescaped, and part of why sending
 * sits behind admin authentication.
 */
export const SendNewsletterInputSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
});

export type SendNewsletterInput = z.infer<typeof SendNewsletterInputSchema>;
