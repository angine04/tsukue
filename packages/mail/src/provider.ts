/**
 * The one interface every adapter implements (AGENTS 15.1).
 *
 * `from` is a complete sender — display name included, as
 * `Tsukue <comments@notify.example.com>` — because providers differ on whether
 * the name travels beside the address or woven into it, and normalising that
 * here would mean an adapter that cannot express what its provider supports.
 */
export interface MailProvider {
  send(input: {
    to: string;
    from: string;
    replyTo?: string;
    subject: string;
    html: string;
    text?: string;
    headers?: Record<string, string>;
  }): Promise<void>;
}
