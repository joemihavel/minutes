import "server-only";

import { z } from "zod";
import { MAX_AUDIO_UPLOAD_BYTES } from "@/lib/limits";
import { AppError } from "./errors";

export const MAX_TRANSCRIPT_CHARS = 250_000;
export const MAX_CHAT_CONTEXT_CHARS = 90_000;

export const uuidSchema = z.uuid();
export const providerSchema = z.enum(["groq", "google"]);
export const connectionSchema = z.object({
  provider: providerSchema,
  apiKey: z.string().trim().min(12).max(512),
});
export const modelUpdateSchema = z.object({
  provider: providerSchema,
  capability: z.enum(["transcription", "chat"]),
  modelId: z.string().trim().min(2).max(120).regex(/^[a-zA-Z0-9][a-zA-Z0-9._/:+-]*$/),
});
const publicHttpsUrl = z.string().trim().max(500).transform((value, context) => {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const ipLiteral = /^[\d.]+$/.test(hostname) || hostname.includes(":");
    const privateHost = ipLiteral
      || hostname === "localhost"
      || hostname === "::1"
      || hostname.endsWith(".local")
      || /^127\./.test(hostname)
      || /^10\./.test(hostname)
      || /^192\.168\./.test(hostname)
      || /^169\.254\./.test(hostname)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(hostname);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || privateHost) throw new Error();
    return url.toString().replace(/\/$/, "");
  } catch {
    context.addIssue({ code: "custom", message: "Enter a public HTTPS API base URL." });
    return z.NEVER;
  }
});
export const customModelSchema = z.object({
  name: z.string().trim().min(2).max(80),
  providerName: z.string().trim().min(2).max(80),
  baseUrl: publicHttpsUrl,
  modelId: z.string().trim().min(2).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9._/:+-]*$/),
  apiKey: z.string().trim().min(8).max(1_000),
});
export const clipUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    transcript: z.string().max(MAX_TRANSCRIPT_CHARS).optional(),
  })
  .refine((value) => value.title !== undefined || value.transcript !== undefined);
export const shareSchema = z.object({
  includeAudio: z.boolean().default(false),
  expiresInDays: z.union([z.literal(1), z.literal(7), z.literal(30), z.null()]).default(null),
});
export const chatRequestSchema = z.object({
  clipIds: z.array(uuidSchema).min(1).max(5).transform((ids) => [...new Set(ids)]),
  provider: z.union([
    providerSchema,
    z.string().regex(/^custom:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
  ]),
  message: z.object({
    id: z.string().min(1).max(128),
    role: z.literal("user"),
    parts: z.array(z.object({ type: z.literal("text"), text: z.string().trim().min(1).max(4_000) })).min(1).max(1),
  }),
});
export const summaryRequestSchema = z.object({
  provider: providerSchema,
  regenerate: z.boolean().default(false),
});

const allowedMimes = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "video/mp4",
]);
const allowedExtensions = new Set(["mp3", "m4a", "mp4", "wav", "webm", "ogg", "oga"]);

export function validateAudioMetadata(
  file: { name: string; type: string; size: number },
  maxBytes = MAX_AUDIO_UPLOAD_BYTES,
) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedMimes.has(file.type) || !allowedExtensions.has(extension)) {
    throw new AppError(
      "Choose an MP3, M4A, MP4, WAV, WebM, or OGG audio file.",
      415,
      "UNSUPPORTED_AUDIO",
    );
  }
  if (file.size <= 0 || file.size > maxBytes) {
    const maxMb = Math.floor(maxBytes / 1024 / 1024);
    throw new AppError(
      `Audio files must be smaller than ${maxMb} MB.`,
      413,
      "AUDIO_TOO_LARGE",
    );
  }
}

export function validateAudio(file: File, maxBytes = MAX_AUDIO_UPLOAD_BYTES) {
  validateAudioMetadata(file, maxBytes);
}

export async function parseJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  maxBytes = 32_000,
) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new AppError("Request is too large.", 413, "PAYLOAD_TOO_LARGE");
  const body = await request.text();
  if (Buffer.byteLength(body) > maxBytes) {
    throw new AppError("Request is too large.", 413, "PAYLOAD_TOO_LARGE");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new AppError("Request body must be valid JSON.", 400, "INVALID_JSON");
  }
  return schema.parse(parsed);
}
