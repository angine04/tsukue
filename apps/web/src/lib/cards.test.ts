import { describe, expect, it } from "vitest";
import { seededRotation } from "./cards";

describe("seededRotation", () => {
  it("is stable for the same post across builds", () => {
    expect(seededRotation("en/on-slowness")).toBe(
      seededRotation("en/on-slowness"),
    );
  });

  it("stays inside the rotation range the schema allows", () => {
    const ids = Array.from({ length: 500 }, (_, index) => `en/post-${index}`);
    for (const id of ids) {
      const angle = seededRotation(id);
      expect(angle).toBeGreaterThanOrEqual(-5);
      expect(angle).toBeLessThanOrEqual(5);
    }
  });

  it("spreads posts across both directions instead of clustering", () => {
    const angles = Array.from({ length: 500 }, (_, index) =>
      seededRotation(`en/post-${index}`),
    );
    const negative = angles.filter((angle) => angle < 0).length;
    expect(negative).toBeGreaterThan(150);
    expect(negative).toBeLessThan(350);
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(6);
  });

  it("decorrelates neighbouring posts, which an unfinalised hash does not", () => {
    const angles = Array.from({ length: 500 }, (_, index) =>
      seededRotation(`en/post-${index}`),
    );
    const deltas = angles
      .slice(1)
      .map((angle, index) => Math.abs(angle - angles[index]));
    const meanDelta =
      deltas.reduce((total, delta) => total + delta, 0) / deltas.length;
    // Independent angles over an 8deg range average ~2.67 apart; a correlated
    // hash collapses this towards zero and the desk looks flat.
    expect(meanDelta).toBeGreaterThan(1.5);
  });

  it("gives each language version of a post its own angle", () => {
    expect(seededRotation("en/on-slowness")).not.toBe(
      seededRotation("zh-Hans/slow-in-fast-world"),
    );
  });
});
