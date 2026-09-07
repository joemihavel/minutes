import { describe, expect, it } from "vitest";
import {
  isTranscriptionStale,
  isUploadStale,
  TRANSCRIPTION_STALE_MS,
  UPLOAD_STALE_MS,
} from "./transcription-status";

describe("isTranscriptionStale", () => {
  it("keeps active transcription jobs pending", () => {
    const now = Date.UTC(2026, 8, 7, 12);
    expect(isTranscriptionStale(new Date(now - TRANSCRIPTION_STALE_MS + 1), now)).toBe(false);
  });

  it("makes timed-out jobs recoverable", () => {
    const now = Date.UTC(2026, 8, 7, 12);
    expect(isTranscriptionStale(new Date(now - TRANSCRIPTION_STALE_MS), now)).toBe(true);
  });
});

describe("isUploadStale", () => {
  it("turns abandoned direct uploads into recoverable failures", () => {
    const now = Date.UTC(2026, 8, 7, 12);
    expect(isUploadStale(new Date(now - UPLOAD_STALE_MS), now)).toBe(true);
    expect(isUploadStale(new Date(now - UPLOAD_STALE_MS + 1), now)).toBe(false);
  });
});
