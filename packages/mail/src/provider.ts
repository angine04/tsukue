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

export interface MailProviderConfig {
  apiKey: string;
  fromEmail: string;
  fromName?: string;
}
