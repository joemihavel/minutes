const sectionTitles = [
  "Overview",
  "Key points",
  "Decisions",
  "Action items",
  "Open questions",
] as const;

const sectionHeadingPattern = /^\s*#{1,6}\s*\**\s*(Overview|Key points|Decisions|Action items|Open questions)\s*\**\s*:?\s*$/gim;
const reasoningBlockPattern = /<(think|thinking|analysis|reasoning)\b[^>]*>[\s\S]*?<\/\1>/gi;
const reasoningTagPattern = /<\/?(?:think|thinking|analysis|reasoning)\b[^>]*>/gi;
const reasoningLinePattern = /^(?:here(?:'s| is) (?:a |the )?thinking process|self[- ]?correction(?:\/verification)?|verification during thought|output generation|everything aligns|all constraints (?:are )?met|the output matches|output matches|proceeds?\.?|that's fine|the draft is solid|should i\b|i(?:'ll| will) (?:draft|make sure|keep|output|note)|\d+[.)]\s*\**(?:analy[sz]e|evaluate|map|draft construction|check constraints))/i;

export type SummarySection = {
  title: (typeof sectionTitles)[number];
  body: string;
};

function cleanInlineMarkdown(value: string) {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^\s*```(?:markdown)?\s*$/i, "")
    .trim();
}

function cleanSectionBody(value: string) {
  const lines = value.split("\n").map((line) => line.trim());
  const reasoningStart = lines.findIndex((line) => reasoningLinePattern.test(line));
  const content = (reasoningStart >= 0 ? lines.slice(0, reasoningStart) : lines)
    .map(cleanInlineMarkdown)
    .filter(Boolean)
    .map((line) => line.replace(/^\d+[.)]\s+/, "- "));
  return content.join("\n").trim();
}

function extractSections(value: string) {
  const matches = [...value.matchAll(sectionHeadingPattern)];
  if (!matches.length) return [];
  return matches.map((match, index) => ({
    title: match[1].toLowerCase(),
    body: cleanSectionBody(
      value.slice(
        (match.index ?? 0) + match[0].length,
        matches[index + 1]?.index ?? value.length,
      ),
    ),
  }));
}

export function sanitizeGeneratedSummary(value: string) {
  let summary = value
    .replace(reasoningBlockPattern, "")
    .replace(/^\s*```(?:markdown)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  const unclosedReasoning = /<(?:think|thinking|analysis|reasoning)\b[^>]*>/i.test(summary);
  const firstHeading = summary.search(new RegExp(sectionHeadingPattern.source, "im"));
  if (unclosedReasoning && firstHeading < 0) return "";
  if (firstHeading > 0) summary = summary.slice(firstHeading);
  summary = summary.replace(reasoningTagPattern, "").trim();

  const extracted = extractSections(summary);
  const byTitle = new Map(extracted.map((section) => [section.title, section.body]));
  if (!extracted.length) {
    const overview = cleanSectionBody(summary);
    if (!overview || reasoningLinePattern.test(overview)) return "";
    byTitle.set("overview", overview);
  }

  return sectionTitles
    .map((title) => `## ${title}\n${byTitle.get(title.toLowerCase()) || "Nothing captured"}`)
    .join("\n\n")
    .slice(0, 24_000);
}

export function parseSummarySections(value: string): SummarySection[] {
  const summary = sanitizeGeneratedSummary(value);
  if (!summary) return [];
  return extractSections(summary).map((section, index) => ({
    title: sectionTitles[index],
    body: section.body || "Nothing captured",
  }));
}
