import "server-only";

import { FileState, GoogleGenAI } from "@google/genai";
import type { TranscriptSegment } from "@/lib/types";
import { AppError } from "./errors";

type WordAnnotation = {
  type: "word_info";
  text?: string;
  speaker?: string;
  start_offset?: string;
  end_offset?: string;
};

function secondsFromOffset(value?: string) {
  if (!value) return 0;
  const parsed = Number(value.replace(/s$/, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function appendWord(current: string, word: string) {
  const clean = word.trim();
  if (!clean) return current;
  if (!current || /^[,.;:!?%)\]}]/.test(clean)) return `${current}${clean}`;
  if (/^['’]/.test(clean)) return `${current}${clean}`;
  return `${current} ${clean}`;
}

function readableSpeaker(raw: string | undefined, labels: Map<string, string>) {
  const key = raw?.trim() || "speaker";
  const existing = labels.get(key);
  if (existing) return existing;
  const label = `Speaker ${labels.size + 1}`;
  labels.set(key, label);
  return label;
}

function segmentsFromWords(words: WordAnnotation[], labels: Map<string, string>) {
  const segments: TranscriptSegment[] = [];
  for (const word of words) {
    const text = word.text?.trim();
    if (!text) continue;
    const speaker = readableSpeaker(word.speaker, labels);
    const startSecond = secondsFromOffset(word.start_offset);
    const endSecond = Math.max(startSecond, secondsFromOffset(word.end_offset));
    const previous = segments.at(-1);
    if (previous?.speaker === speaker) {
      previous.text = appendWord(previous.text, text);
      previous.endSecond = Math.max(previous.endSecond, endSecond);
    } else {
      segments.push({ text, speaker, startSecond, endSecond });
    }
  }
  return segments;
}

async function waitUntilActive(ai: GoogleGenAI, name: string, signal: AbortSignal) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const file = await ai.files.get({ name });
    if (file.state === FileState.ACTIVE) return file;
    if (file.state === FileState.FAILED) {
      throw new AppError("Google AI could not process this audio file.", 502, "GOOGLE_FILE_FAILED");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new AppError("Google AI took too long to prepare this audio file.", 504, "GOOGLE_FILE_TIMEOUT");
}

export async function transcribeWithGoogle(input: {
  apiKey: string;
  model: string;
  audio: Buffer;
  filename: string;
  mediaType: string;
  signal: AbortSignal;
  speakerLabels: Map<string, string>;
}): Promise<{
  text: string;
  segments: TranscriptSegment[];
  durationInSeconds?: number;
}> {
  const ai = new GoogleGenAI({ apiKey: input.apiKey, apiVersion: "v1beta" });
  let uploadedName: string | undefined;
  try {
    const uploaded = await ai.files.upload({
      file: new Blob([new Uint8Array(input.audio)], { type: input.mediaType }),
      config: {
        displayName: input.filename,
        mimeType: input.mediaType,
        abortSignal: input.signal,
      },
    });
    uploadedName = uploaded.name;
    if (!uploadedName) {
      throw new AppError("Google AI did not return an audio file reference.", 502, "GOOGLE_FILE_INVALID");
    }
    const active = uploaded.state === FileState.ACTIVE
      ? uploaded
      : await waitUntilActive(ai, uploadedName, input.signal);
    if (!active.uri) {
      throw new AppError("Google AI did not return an audio file URL.", 502, "GOOGLE_FILE_INVALID");
    }

    const interaction = await ai.interactions.create({
      model: input.model,
      input: [{ type: "audio", uri: active.uri, mime_type: input.mediaType }],
      generation_config: {
        transcription_config: {
          language_codes: [],
          mode: {
            type: "verbatim",
            diarization_mode: "speaker",
            timestamp_granularities: ["word"],
          },
        },
      },
      store: false,
    }, { timeout: 180_000, maxRetries: 2, fetchOptions: { signal: input.signal } });

    const words: WordAnnotation[] = [];
    for (const step of interaction.steps ?? []) {
      if (step.type !== "model_output") continue;
      for (const content of step.content ?? []) {
        if (content.type !== "text") continue;
        for (const annotation of content.annotations ?? []) {
          if (annotation.type === "word_info") words.push(annotation);
        }
      }
    }
    const segments = segmentsFromWords(words, input.speakerLabels);
    const outputText = interaction.output_text?.trim() ?? "";
    const attributedText = segments.map((segment) => `${segment.speaker}: ${segment.text}`).join("\n");
    const outputWordCount = outputText.split(/\s+/).filter(Boolean).length;
    const attributedWordCount = segments
      .flatMap((segment) => segment.text.split(/\s+/).filter(Boolean))
      .length;
    const annotationsCoverOutput = !outputText || attributedWordCount >= outputWordCount * 0.9;
    const text = annotationsCoverOutput && attributedText ? attributedText : outputText;
    if (!text) {
      throw new AppError("Google AI returned an empty transcript.", 502, "GOOGLE_TRANSCRIPT_EMPTY");
    }
    return {
      text,
      segments: annotationsCoverOutput ? segments : [],
      durationInSeconds: segments.at(-1)?.endSecond,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new AppError("Google AI transcription timed out.", 504, "GOOGLE_TIMEOUT");
    }
    const message = error instanceof Error ? error.message : "";
    if (/401|403|api.?key|permission/i.test(message)) {
      throw new AppError("Your Google AI key no longer has access. Reconnect it in AI setup.", 422, "GOOGLE_AUTH");
    }
    if (/429|quota|rate.?limit/i.test(message)) {
      throw new AppError("Your Google AI quota has been reached. Wait for it to reset or use Groq.", 429, "GOOGLE_RATE_LIMIT");
    }
    throw new AppError("Google AI could not transcribe this recording.", 502, "GOOGLE_TRANSCRIPTION_FAILED");
  } finally {
    if (uploadedName) await ai.files.delete({ name: uploadedName }).catch(() => undefined);
  }
}
