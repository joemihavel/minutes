import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clips } from "@/db/schema";
import { recordUsage } from "@/data/usage";
import type { Provider, TranscriptSegment } from "@/lib/types";
import { createTranscriptionChunks } from "@/lib/server/audio-processing";
import { AppError, safeErrorDetails } from "@/lib/server/errors";
import { transcribeWithGoogle } from "@/lib/server/google-transcription";
import { transcribeWithGroq } from "@/lib/server/groq-transcription";
import { sanitizeTranscriptSegments, sanitizeTranscriptText } from "@/lib/transcript";

const TRANSCRIPTION_PROMPT =
  "Hindi, English, and natural Hinglish speech. Preserve code-switching, names, numbers, and meaning accurately. Transcribe the complete audio without summarizing or stopping early.";

export async function processClipTranscription(input: {
  userId: string;
  clipId: string;
  provider: Provider;
  apiKey: string;
  model: string;
  audio: Buffer;
  filename: string;
  mediaType: string;
}) {
  try {
    const google = input.provider === "google";
    const prepared = await createTranscriptionChunks(
      input.audio,
      input.filename,
      input.mediaType,
      google
        ? { chunkSeconds: 28 * 60, maxDirectBytes: 90 * 1024 * 1024 }
        : { chunkSeconds: 10 * 60 },
    );
    const transcriptParts: string[] = [];
    const mergedSegments: TranscriptSegment[] = [];
    const languages: string[] = [];
    const speakerLabels = new Map<string, string>();
    let durationSeconds = Math.round(prepared.durationSeconds);
    let previousStartedAt = 0;
    try {
      for (const [index, chunk] of prepared.chunks.entries()) {
        const signal = AbortSignal.timeout(190_000);
        if (!google && index > 0) {
          const waitMs = Math.max(0, 3_200 - (Date.now() - previousStartedAt));
          if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        previousStartedAt = Date.now();
        const previousContext = transcriptParts.at(-1)?.slice(-240);
        const result = google
          ? await transcribeWithGoogle({
              apiKey: input.apiKey,
              model: input.model,
              audio: chunk.audio,
              filename: chunk.filename,
              mediaType: chunk.mediaType,
              signal,
              speakerLabels,
            })
          : await transcribeWithGroq({
              apiKey: input.apiKey,
              model: input.model,
              audio: chunk.audio,
              filename: chunk.filename,
              mediaType: chunk.mediaType,
              signal,
              prompt: previousContext
                ? `${TRANSCRIPTION_PROMPT} Previous context: ${previousContext}`
                : TRANSCRIPTION_PROMPT,
            });
        transcriptParts.push(result.text.trim());
        mergedSegments.push(...result.segments.map((segment) => ({
          ...segment,
          startSecond: segment.startSecond + chunk.offsetSeconds,
          endSecond: segment.endSecond + chunk.offsetSeconds,
        })));
        if ("language" in result && typeof result.language === "string") languages.push(result.language);
        durationSeconds = Math.max(
          durationSeconds,
          Math.round(chunk.offsetSeconds + (result.durationInSeconds ?? 0)),
        );
      }
    } finally {
      await prepared.cleanup();
    }

    const transcript = sanitizeTranscriptText(transcriptParts.filter(Boolean).join("\n\n")).slice(0, 250_000);
    if (!transcript) throw new AppError("The transcription was empty.", 502, "TRANSCRIPTION_EMPTY");
    const safeSegments = sanitizeTranscriptSegments(mergedSegments);
    const language = languages.sort(
      (a, b) => languages.filter((value) => value === b).length - languages.filter((value) => value === a).length,
    )[0];
    try {
      await getDb().update(clips).set({
        transcript,
        segments: safeSegments,
        durationSeconds: durationSeconds || null,
        language: language?.slice(0, 24) ?? null,
        status: "ready",
        errorMessage: null,
        updatedAt: new Date(),
      }).where(eq(clips.id, input.clipId));
    } catch (saveError) {
      console.error("Transcript segment save failed; retrying without timestamps", safeErrorDetails(saveError));
      await getDb().update(clips).set({
        transcript,
        segments: [],
        durationSeconds: durationSeconds || null,
        language: language?.slice(0, 24) ?? null,
        status: "ready",
        errorMessage: null,
        updatedAt: new Date(),
      }).where(eq(clips.id, input.clipId));
    }
    await recordUsage({
      userId: input.userId,
      clipId: input.clipId,
      provider: input.provider,
      model: input.model,
      operation: "transcription",
      audioSeconds: durationSeconds,
    });
  } catch (error) {
    console.error("Background clip transcription failed", safeErrorDetails(error));
    const message = error instanceof AppError
      ? error.message
      : "The recording was saved, but transcription failed. Check your AI connection and try again.";
    await getDb().update(clips).set({
      status: "failed",
      errorMessage: message.slice(0, 280),
      updatedAt: new Date(),
    }).where(eq(clips.id, input.clipId)).catch(() => undefined);
  }
}
