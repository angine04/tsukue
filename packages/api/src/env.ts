/**
 * The slice of Cloudflare's runtime this package touches, declared
 * structurally. Two reasons it is not imported from `@cloudflare/workers-types`:
 * the shapes used here are three methods wide, and a structural declaration
 * lets the queries run against a stub in tests rather than requiring the real
 * binding to be present.
 */
export interface D1Result<T> {
  results: T[];
  success: boolean;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<unknown>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

/**
 * Everything the API reads from the environment.
 *
 * One shape for the whole Function rather than one per feature: the comment and
 * newsletter endpoints run in the same Worker, against the same database
 * binding, with the same secrets. Secrets are optional at the type level because
 * a deployment can be missing them; each is checked where it is used, and every
 * check fails closed.
 */
export interface ApiEnv {
  DB: D1Database;

  /** Turnstile secret. Without it, submissions are rejected. */
  TURNSTILE_SECRET?: string;
  /** Salt for the IP / user-agent / email lookup hashes. */
  HASH_SALT?: string;
  /** Base64 32-byte AES-GCM key, for the address reply notifications go to. */
  EMAIL_ENCRYPTION_KEY?: string;
  /** Where moderation notifications are sent. */
  ADMIN_EMAIL?: string;

  /** Mail transport configuration; see `@tsukue/mail`. */
  MAIL_PROVIDER?: string;
  MAIL_ENDPOINT?: string;
  MAIL_TOKEN?: string;
  MAIL_FROM?: string;
}
