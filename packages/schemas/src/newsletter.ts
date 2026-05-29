import { z } from "zod";

export const SubscriberStatus = z.enum([
  "pending",
  "active",
  "unsubscribed",
  "bounced",
  "complained",
]);

export type SubscriberStatus = z.infer<typeof SubscriberStatus>;

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

export const SubscribeInputSchema = z.object({
  email: z.string().email(),
});

export type SubscribeInput = z.infer<typeof SubscribeInputSchema>;

export const UnsubscribeInputSchema = z.object({
  token: z.string().min(1),
});

export type UnsubscribeInput = z.infer<typeof UnsubscribeInputSchema>;
