import { describe, expect, it } from "vitest";
import { safeFilename, titleFromFilename } from "./clip-helpers";

describe("clip helpers", () => {
  it("creates readable titles without changing internal dots", () => {
    expect(titleFromFilename("Sprint.review.v2.m4a")).toBe("Sprint.review.v2");
  });

  it("preserves Hindi letters while removing unsafe path characters", () => {
    expect(safeFilename("../ मीटिंग: final?.mp3")).toBe("-मीटिंग-final.mp3");
  });

  it("returns a safe fallback for symbol-only names", () => {
    expect(safeFilename("🔥")).toBe("audio");
  });
});
