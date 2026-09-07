import { describe, expect, it } from "vitest";
import {
  compactTranscriptExcerpts,
  isProviderRequestTooLarge,
} from "./summary-context";

describe("compactTranscriptExcerpts", () => {
  it("keeps short transcripts unchanged", () => {
    expect(compactTranscriptExcerpts("A short transcript.", 100)).toBe("A short transcript.");
  });

  it("fits long transcripts while retaining coverage across the recording", () => {
    const transcript = Array.from(
      { length: 80 },
      (_, index) => `Segment ${index}: project detail and decision.`,
    ).join(" ");
    const compacted = compactTranscriptExcerpts(transcript, 900);

    expect(compacted.length).toBeLessThanOrEqual(900);
    expect(compacted).toContain("Segment 0");
    expect(compacted).toMatch(/Segment (?:3\d|4\d)/);
    expect(compacted).toContain("Segment 79");
    expect(compacted).toContain("transcript continues");
  });
});

describe("isProviderRequestTooLarge", () => {
  it("recognizes provider token-limit errors", () => {
    expect(isProviderRequestTooLarge(new Error("Request too large for model on input tokens per minute"))).toBe(true);
    expect(isProviderRequestTooLarge(new Error("This model is currently experiencing high demand"))).toBe(false);
  });
});
