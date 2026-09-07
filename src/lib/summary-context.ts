const OMISSION_MARKER = "\n\n[... transcript continues ...]\n\n";

export const GROQ_SUMMARY_CONTEXT_CHARS = 18_000;
export const GROQ_SUMMARY_RETRY_CONTEXT_CHARS = 10_000;

export function compactTranscriptExcerpts(value: string, maxChars: number) {
  const transcript = value.trim();
  if (transcript.length <= maxChars) return transcript;

  const excerptCount = 8;
  const markerChars = OMISSION_MARKER.length * (excerptCount - 1);
  const excerptChars = Math.floor((maxChars - markerChars) / excerptCount);
  if (excerptChars < 1) return transcript.slice(0, Math.max(0, maxChars));

  const lastStart = transcript.length - excerptChars;
  const excerpts = Array.from({ length: excerptCount }, (_, index) => {
    const start = Math.round((lastStart * index) / (excerptCount - 1));
    return transcript.slice(start, start + excerptChars).trim();
  });

  return excerpts.join(OMISSION_MARKER).slice(0, maxChars);
}

export function isProviderRequestTooLarge(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /request too large|input tokens per minute|output tokens per minute/i.test(error.message);
}
