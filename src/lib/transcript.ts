import type { TranscriptSegment } from "./types";

const UNSAFE_TEXT_CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeTranscriptText(value: string) {
  return value.replace(UNSAFE_TEXT_CONTROLS, "").replace(/\r\n?/g, "\n").trim();
}

export function sanitizeTranscriptSegments(segments: TranscriptSegment[]) {
  return segments.flatMap((segment) => {
    const text = sanitizeTranscriptText(segment.text);
    const startSecond = Number(segment.startSecond);
    const endSecond = Number(segment.endSecond);
    if (!text || !Number.isFinite(startSecond) || !Number.isFinite(endSecond)) return [];
    const speaker = segment.speaker
      ?.replace(/[^\p{L}\p{N} ._-]/gu, "")
      .trim()
      .slice(0, 40) || null;
    return [{
      text,
      startSecond: Math.max(0, startSecond),
      endSecond: Math.max(startSecond, endSecond),
      ...(speaker ? { speaker } : {}),
    }];
  });
}
