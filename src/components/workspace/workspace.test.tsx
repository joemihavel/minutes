import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownMessage } from "./markdown-message";

describe("MarkdownMessage", () => {
  it("renders assistant Markdown as semantic HTML", () => {
    const html = renderToStaticMarkup(
      <MarkdownMessage
        content={"### Demo priorities\n\n**Launch:** Monday\n\n- Test uploads\n- Test permissions"}
        streaming={false}
      />,
    );

    expect(html).toContain("<h3>Demo priorities</h3>");
    expect(html).toContain("<strong>Launch:</strong>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>Test uploads</li>");
  });

  it("does not render raw HTML as elements", () => {
    const html = renderToStaticMarkup(
      <MarkdownMessage content={'Safe <script>alert("unsafe")</script> answer'} streaming={false} />,
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain('Safe alert(&quot;unsafe&quot;) answer');
  });
});
