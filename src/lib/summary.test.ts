import { describe, expect, it } from "vitest";
import { parseSummarySections, sanitizeGeneratedSummary } from "./summary";

describe("sanitizeGeneratedSummary", () => {
  it("removes a closed reasoning block and keeps only the finished summary", () => {
    const summary = sanitizeGeneratedSummary(`<think>Analyze the transcript in detail.</think>
## Overview
A short bilingual check-in.

## Key points
- Audio was tested.

## Decisions
Nothing captured

## Action items
Nothing captured

## Open questions
Nothing captured`);

    expect(summary).not.toContain("<think>");
    expect(summary).not.toContain("Analyze the transcript");
    expect(summary).toContain("## Overview\nA short bilingual check-in.");
  });

  it("salvages structured content from an unclosed think block without leaking later planning", () => {
    const summary = sanitizeGeneratedSummary(`<think>
Here's a thinking process:
1. **Analyze User Input:**
## Overview
The recording contains an initial audio check before ending.
## Key points
## Decisions
## Action items
## Open questions
5. **Check Constraints:**
Everything aligns. I will output exactly this.`);

    expect(summary).not.toContain("thinking process");
    expect(summary).not.toContain("Check Constraints");
    expect(summary).not.toContain("Everything aligns");
    expect(parseSummarySections(summary)).toEqual([
      { title: "Overview", body: "The recording contains an initial audio check before ending." },
      { title: "Key points", body: "Nothing captured" },
      { title: "Decisions", body: "Nothing captured" },
      { title: "Action items", body: "Nothing captured" },
      { title: "Open questions", body: "Nothing captured" },
    ]);
  });

  it("rejects an unclosed reasoning block with no finished summary", () => {
    expect(sanitizeGeneratedSummary("<think>Still analyzing the input")).toBe("");
  });
});
