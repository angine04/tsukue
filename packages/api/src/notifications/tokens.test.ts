import { describe, expect, it } from "vitest";
import { optOutToken, readOptOutToken } from "./tokens.js";

const SECRET = "test-salt";

const thread = {
  emailHash: "abc123",
  scope: "thread" as const,
  threadId: "comment-1",
};

const everything = {
  emailHash: "abc123",
  scope: "all" as const,
  threadId: "",
};

describe("optOutToken", () => {
  it("round-trips a thread opt-out", async () => {
    const token = await optOutToken(thread, SECRET);
    expect(await readOptOutToken(token, SECRET)).toEqual(thread);
  });

  it("round-trips a blanket opt-out", async () => {
    const token = await optOutToken(everything, SECRET);
    expect(await readOptOutToken(token, SECRET)).toEqual(everything);
  });

  it("keeps an email hash out of the token", async () => {
    // The hash is in there, base64 — which is the point of hashing it before it
    // ever reaches a link. What must not appear is an address.
    const token = await optOutToken(
      { emailHash: "deadbeef", scope: "all", threadId: "" },
      SECRET,
    );
    expect(token).not.toContain("@");
  });

  it("refuses a token signed with a different salt", async () => {
    const token = await optOutToken(thread, "some-other-salt");
    expect(await readOptOutToken(token, SECRET)).toBeNull();
  });

  it("refuses a token whose payload was edited", async () => {
    const token = await optOutToken(thread, SECRET);
    const [, signature] = token.split(".");

    // The same signature over a different address: exactly what somebody would
    // try in order to unsubscribe a reader who is not them.
    const forgedPayload = btoa("someone-else|thread|comment-1")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(
      await readOptOutToken(`${forgedPayload}.${signature}`, SECRET),
    ).toBeNull();
  });

  it("refuses anything that is not one of our tokens", async () => {
    for (const bad of ["", ".", "nonsense", "a.b.c", "..", "onlyonepart"]) {
      expect(await readOptOutToken(bad, SECRET), bad).toBeNull();
    }
  });

  it("refuses a thread token that names no thread", async () => {
    // Signed honestly, but a `thread` scope with an empty id would look like the
    // blanket row's shape once it reached the query, so it must not survive.
    const token = await optOutToken(
      { emailHash: "abc123", scope: "thread", threadId: "" },
      SECRET,
    );
    expect(await readOptOutToken(token, SECRET)).toBeNull();
  });

  it("refuses a scope that is not one of the two", async () => {
    const token = await optOutToken(
      { emailHash: "abc123", scope: "all" as const, threadId: "" },
      SECRET,
    );
    const [, signature] = token.split(".");
    const forged = btoa("abc123|everything|")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await readOptOutToken(`${forged}.${signature}`, SECRET)).toBeNull();
  });
});
