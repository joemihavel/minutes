export const TRANSCRIPTION_STALE_MS = 6 * 60 * 1_000;

export function isTranscriptionStale(
  updatedAt: Date | string,
  now = Date.now(),
) {
  return now - new Date(updatedAt).getTime() >= TRANSCRIPTION_STALE_MS;
}
