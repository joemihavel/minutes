import { describe, expect, it } from "vitest";
import { sanitizeTranscriptSegments, sanitizeTranscriptText } from "./transcript";

describe("transcript sanitization", () => {
  it("removes database-unsafe control characters while preserving new lines", () => {
    expect(sanitizeTranscriptText("Hello\u0000\r\nनमस्ते\u0007")).toBe("Hello\nनमस्ते");
  });

  it("drops invalid timestamp segments", () => {
    expect(sanitizeTranscriptSegments([
      { text: " valid ", startSecond: 2, endSecond: 4 },
      { text: "bad", startSecond: Number.NaN, endSecond: 8 },
    ])).toEqual([{ text: "valid", startSecond: 2, endSecond: 4 }]);
  });

  it("preserves safe speaker labels and removes unsafe characters", () => {
    expect(sanitizeTranscriptSegments([
      { text: " Hello ", startSecond: 1, endSecond: 2, speaker: " Speaker 1<script> " },
    ])).toEqual([{ text: "Hello", startSecond: 1, endSecond: 2, speaker: "Speaker 1script" }]);
  });
});
