import "server-only";

import { z } from "zod";
import type { TranscriptSegment } from "@/lib/types";
import { AppError } from "./errors";

const responseSchema = z.object({
  text: z.string(),
  language: z.string().nullish(),
  duration: z.number().nullish(),
  segments: z.array(z.object({
    start: z.number(),
    end: z.number(),
    text: z.string(),
    tokens: z.array(z.number()).nullish(),
  }).passthrough()).nullish(),
}).passthrough();

export async function transcribeWithGroq(input: {
  apiKey: string;
  model: string;
  audio: Buffer;
  filename: string;
  mediaType: string;
  prompt: string;
  signal: AbortSignal;
}): Promise<{
  text: string;
  segments: TranscriptSegment[];
  language?: string;
  durationInSeconds?: number;
}> {
  const form = new FormData();
  form.set("model", input.model);
  form.set("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  form.set("prompt", input.prompt);
  form.set(
    "file",
    new File([Uint8Array.from(input.audio)], input.filename, { type: input.mediaType }),
  );

  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${input.apiKey}` },
      body: form,
      signal: input.signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError("Groq transcription timed out. Please try again.", 504, "GROQ_TIMEOUT");
    }
    throw new AppError("Groq could not be reached. Please try again.", 503, "GROQ_UNAVAILABLE");
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new AppError("Your Groq key no longer has access. Reconnect it in AI connections.", 422, "GROQ_AUTH");
    }
    if (response.status === 413) {
      throw new AppError("Groq rejected an audio chunk as too large.", 413, "GROQ_FILE_LIMIT");
    }
    if (response.status === 429) {
      throw new AppError("Your Groq free-tier limit has been reached. Wait for it to reset and try again.", 429, "GROQ_RATE_LIMIT");
    }
    throw new AppError("Groq could not transcribe this audio format. Try MP3, M4A, WAV, or FLAC.", 502, "GROQ_TRANSCRIPTION_FAILED");
  }

  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new AppError("Groq returned an unreadable transcription response. Please retry.", 502, "GROQ_RESPONSE_INVALID");
  }
  return {
    text: parsed.data.text,
    segments: parsed.data.segments?.map((segment) => ({
      text: segment.text,
      startSecond: segment.start,
      endSecond: segment.end,
    })) ?? [],
    language: parsed.data.language ?? undefined,
    durationInSeconds: parsed.data.duration ?? undefined,
  };
}
