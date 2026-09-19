import { describe, expect, it } from "vitest";
import {
  decryptEmail,
  encryptEmail,
  hashEmail,
  hashIdentifier,
  normaliseEmail,
} from "./crypto.js";

/**
 * A real 32-byte AES key, base64. Built rather than pasted: a pasted key that
 * is the wrong length fails inside `atob` and looks like a broken test rather
 * than a broken key.
 */
const KEY = btoa(
  String.fromCharCode(...Array.from({ length: 32 }, (_, index) => index + 1)),
);
const OTHER_KEY = btoa(
  String.fromCharCode(...Array.from({ length: 32 }, (_, index) => 200 - index)),
);

describe("normaliseEmail", () => {
  it("folds the differences that would otherwise split one person in two", () => {
    expect(normaliseEmail("  Me@Example.COM ")).toBe("me@example.com");
  });
});

describe("hashIdentifier", () => {
  it("is stable for the same value and salt", async () => {
    expect(await hashIdentifier("203.0.113.7", "a")).toBe(
      await hashIdentifier("203.0.113.7", "a"),
    );
  });

  it("changes with the salt, which is what makes rotation a real lever", async () => {
    expect(await hashIdentifier("203.0.113.7", "a")).not.toBe(
      await hashIdentifier("203.0.113.7", "b"),
    );
  });

  it("does not leak the value it hashed", async () => {
    const hash = await hashIdentifier("203.0.113.7", "salt");
    expect(hash).not.toContain("203");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hashEmail", () => {
  it("treats addresses differing only in case as one identity", async () => {
    expect(await hashEmail("Me@Example.com", "salt")).toBe(
      await hashEmail("me@example.com", "salt"),
    );
  });
});

describe("encryptEmail", () => {
  it("round-trips the address, which is the whole reason it is encrypted", async () => {
    const stored = await encryptEmail("reader@example.com", KEY);
    expect(await decryptEmail(stored, KEY)).toBe("reader@example.com");
  });

  it("produces a different value every time, so rows cannot be matched up", async () => {
    const first = await encryptEmail("reader@example.com", KEY);
    const second = await encryptEmail("reader@example.com", KEY);
    expect(first).not.toBe(second);
    expect(await decryptEmail(first, KEY)).toBe("reader@example.com");
    expect(await decryptEmail(second, KEY)).toBe("reader@example.com");
  });

  it("refuses a value that is not in the stored shape", async () => {
    await expect(decryptEmail("not-encrypted", KEY)).rejects.toThrow();
  });

  it("fails to decrypt under the wrong key rather than returning nonsense", async () => {
    const stored = await encryptEmail("reader@example.com", KEY);
    await expect(decryptEmail(stored, OTHER_KEY)).rejects.toThrow();
  });
});
