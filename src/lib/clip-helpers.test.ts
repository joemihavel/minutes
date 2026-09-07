import { describe, expect, it } from "vitest";
import {
  clientUploadPath,
  isClientUploadPath,
  matchesPersistedUpload,
  safeFilename,
  titleFromFilename,
} from "./clip-helpers";

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

describe("client upload paths", () => {
  it("keeps every upload scoped to its clip", () => {
    const clipId = "9498e078-034a-41ea-b498-91644664c09e";
    expect(clientUploadPath(clipId, "meeting.webm")).toBe(
      `audio/${clipId}/meeting.webm`,
    );
    expect(isClientUploadPath(`audio/${clipId}/meeting-random.webm`, clipId)).toBe(true);
    expect(isClientUploadPath("audio/another-clip/meeting.webm", clipId)).toBe(false);
  });
});
