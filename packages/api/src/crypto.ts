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
  return toBase64(buffer)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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
