import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SummaryContent } from "./summary-content";

describe("SummaryContent", () => {
  it("renders the generated summary as structured, semantic sections", () => {
    const html = renderToStaticMarkup(
      <SummaryContent
        summary={"## Overview\nA bilingual project review.\n\n## Key points\n- Hindi and English were both used.\n- The demo is at 5 PM.\n\n## Decisions\n- Keep code-switching intact."}
      />,
    );

    expect(html).toContain("<h3>Overview</h3>");
    expect(html).toContain("<h3>Key points</h3>");
    expect(html).toContain("<li>Hindi and English were both used.</li>");
    expect(html).toContain("tone-decisions");
  });

  it("falls back to an overview for plain-text summaries", () => {
    const html = renderToStaticMarkup(<SummaryContent summary="A concise overview." />);
    expect(html).toContain("<h3>Overview</h3>");
    expect(html).toContain("A concise overview.");
  });

  it("never renders model reasoning or raw markdown emphasis", () => {
    const html = renderToStaticMarkup(
      <SummaryContent summary={"<think>Private reasoning</think>\n## Overview\nA **clean** summary.\n## Key points\n- One useful point."} />,
    );

    expect(html).not.toContain("Private reasoning");
    expect(html).not.toContain("**");
    expect(html).toContain("A clean summary.");
    expect(html).toContain("<li>One useful point.</li>");
  });
});
