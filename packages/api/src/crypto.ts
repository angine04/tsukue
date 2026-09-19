const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Base64 with the two characters that need escaping in a URL swapped out, and
 * the padding dropped. Used for anything that travels in a link: a token, or a
 * signed payload.
 */
function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const standard = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (standard.length % 4)) % 4);
  return fromBase64(standard + padding);
}

/**
 * Annotated with the buffer type rather than bare `Uint8Array`: since TS 5.7 a
 * typed array is generic over its backing buffer, and `Uint8Array` alone
 * defaults to `ArrayBufferLike`, which `crypto.subtle` will not accept because
 * it might be shared.
 */
function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Addresses are compared and looked up in one normalised form, so the same
 * person writing the same address with different casing is one identity.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * An unguessable value for a link that carries authority: confirming an address,
 * or leaving a mailing list.
 *
 * 32 bytes, because for an unsubscribe link the token is the only thing between
 * a stranger and somebody else's subscription. Base64url without padding, so it
 * survives a query string, an email client and a terminal without escaping —
 * and so a wrapped link never breaks on a `+` being read as a space.
 */
export function randomToken(bytes = 32): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return toBase64Url(buffer);
}

/**
 * A payload with a signature over it: `payload.signature`, both base64url.
 *
 * Used for unsubscribe links, which have to carry authority without a database
 * row to look up — a notification goes to an address a commenter left, and the
 * only thing that should be able to stop those is whoever holds the link. The
 * payload is not secret (an address hash, a scope, a comment id); the signature
 * is what makes it unforgeable, and the hash is what keeps the link from naming
 * an address.
 */
export async function signPayload(
  payload: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return `${toBase64Url(encoder.encode(payload))}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * The payload a token carries, or nothing if the signature does not match.
 *
 * The comparison runs to the end rather than returning at the first difference,
 * so a caller cannot learn a valid signature one character at a time.
 */
export async function verifyPayload(
  token: string,
  secret: string,
): Promise<string | null> {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  let payload: string;
  try {
    payload = new TextDecoder().decode(fromBase64Url(encoded));
  } catch {
    return null;
  }

  const expected = await signPayload(payload, secret);
  if (expected.length !== token.length) return null;

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ token.charCodeAt(index);
  }
  return difference === 0 ? payload : null;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return toHex(new Uint8Array(digest));
}

/**
 * One-way, salted hash for anything that identifies a person — an address, an
 * IP, a user agent.
 *
 * The salt is what makes this different from hashing alone: an unsalted hash
 * of an IP address is reversible by enumerating the 4.3 billion of them, which
 * is minutes of work. It also means rotating the salt severs every stored
 * hash from the person it described, which is the intended lever for a
 * deletion request that must not break referential integrity.
 */
export async function hashIdentifier(
  value: string,
  salt: string,
): Promise<string> {
  return sha256(`${salt}\u0000${value}`);
}

export async function hashEmail(email: string, salt: string): Promise<string> {
  return hashIdentifier(normaliseEmail(email), salt);
}

/**
 * The address itself, encrypted rather than hashed: a reply notification has
 * to be able to send to it, and a hash cannot be sent to.
 *
 * AES-GCM in the format `iv.ciphertext`, both base64. The IV is random per
 * call, so encrypting the same address twice yields different stored values
 * and cannot be spotted by comparing rows.
 */
export async function encryptEmail(
  email: string,
  base64Key: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    fromBase64(base64Key),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(email),
  );
  return `${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptEmail(
  payload: string,
  base64Key: string,
): Promise<string> {
  const [ivPart, ciphertextPart] = payload.split(".");
  if (!ivPart || !ciphertextPart) {
    throw new Error("Encrypted address is not in `iv.ciphertext` form.");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    fromBase64(base64Key),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivPart) },
    key,
    fromBase64(ciphertextPart),
  );
  return new TextDecoder().decode(plaintext);
}
