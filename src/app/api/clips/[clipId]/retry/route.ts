import { after } from "next/server";
import { get } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clips } from "@/db/schema";
import { getClipDTO, getOwnedClipRow } from "@/data/clips";
import { requireUserId } from "@/lib/server/auth";
import { AppError, errorResponse, safeErrorDetails } from "@/lib/server/errors";
import {
  markClipTranscriptionFailed,
  processClipTranscription,
} from "@/lib/server/process-clip";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getTranscriptionProvider } from "@/lib/server/transcription-provider";
import { isTranscriptionStale } from "@/lib/transcription-status";
import { uuidSchema } from "@/lib/server/validation";

export const maxDuration = 300;

type Context = { params: Promise<{ clipId: string }> };

export async function POST(_request: Request, context: Context) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("upload", userId);
    const clipId = uuidSchema.parse((await context.params).clipId);
    const clip = await getOwnedClipRow(userId, clipId);

    if (!clip.blobUrl) {
      throw new AppError(
        "The original audio is unavailable. Record or upload it again.",
        409,
        "AUDIO_UNAVAILABLE",
      );
    }
    if (clip.status === "ready") {
      throw new AppError("This transcript is already ready.", 409, "ALREADY_READY");
    }
    if (clip.status === "transcribing" && !isTranscriptionStale(clip.updatedAt)) {
      throw new AppError(
        "Transcription is already running.",
        409,
        "TRANSCRIPTION_RUNNING",
      );
    }

    const transcription = await getTranscriptionProvider(userId);
    await getDb().update(clips).set({
      status: "transcribing",
      errorMessage: null,
      updatedAt: new Date(),
    }).where(and(eq(clips.id, clipId), eq(clips.userId, userId)));

    after(async () => {
      try {
        const stored = await get(clip.blobUrl!, { access: "private", useCache: false });
        if (!stored || stored.statusCode !== 200) {
          throw new AppError(
            "The saved audio could not be loaded. Record or upload it again.",
            404,
            "AUDIO_UNAVAILABLE",
          );
        }
        const audio = Buffer.from(await new Response(stored.stream).arrayBuffer());
        await processClipTranscription({
          userId,
          clipId,
          provider: transcription.provider,
          apiKey: transcription.apiKey,
          model: transcription.model,
          audio,
          filename: clip.originalFilename,
          mediaType: clip.mimeType,
        });
      } catch (error) {
        console.error("Clip transcription retry failed", safeErrorDetails(error));
        await markClipTranscriptionFailed(clipId, error);
      }
    });

    return Response.json({ clip: await getClipDTO(userId, clipId) }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
