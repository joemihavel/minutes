import { describe, expect, it } from "vitest";
import { matchesPersistedUpload, safeFilename, titleFromFilename } from "./clip-helpers";

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

describe("matchesPersistedUpload", () => {
  it("matches the server-sanitized name after a lost upload response", () => {
    const startedAt = "2026-09-07T10:00:00.000Z";
    expect(matchesPersistedUpload(
      {
        originalFilename: "Team-sync-final.m4a",
        byteSize: 2048,
        createdAt: "2026-09-07T10:00:01.000Z",
      },
      { name: "Team sync (final).m4a", size: 2048 },
      startedAt,
    )).toBe(true);
  });
});
