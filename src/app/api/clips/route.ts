import { after } from "next/server";
import { del, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clips } from "@/db/schema";
import { getClipDTO, listClips } from "@/data/clips";
import { getUsage, recordUsage } from "@/data/usage";
import {
  MAX_SERVER_AUDIO_UPLOAD_BYTES,
  USER_STORAGE_LIMIT_BYTES,
} from "@/lib/limits";
import { requireUserId } from "@/lib/server/auth";
import { AppError, errorResponse, safeErrorDetails } from "@/lib/server/errors";
import { processClipTranscription } from "@/lib/server/process-clip";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getTranscriptionProvider } from "@/lib/server/transcription-provider";
import { titleFromFilename, safeFilename } from "@/lib/clip-helpers";
import { validateAudio } from "@/lib/server/validation";

export const maxDuration = 300;

export async function GET() {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("read", userId);
    return Response.json({ clips: await listClips(userId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  let clipId: string | null = null;
  let storedBlobUrl: string | null = null;
  let safelyPersisted = false;
  try {
    const userId = await requireUserId();
    await enforceRateLimit("upload", userId);
    const transcription = await getTranscriptionProvider(userId);

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new AppError(
        "The audio upload could not be read. Keep the file under 95 MB and try again.",
        400,
        "INVALID_AUDIO_UPLOAD",
      );
    }
    const file = form.get("audio");
    if (!(file instanceof File)) {
      throw new AppError("Select an audio file to upload.", 422, "AUDIO_REQUIRED");
    }
    validateAudio(file, MAX_SERVER_AUDIO_UPLOAD_BYTES);
    const currentUsage = await getUsage(userId);
    if (currentUsage.storedBytes + file.size > USER_STORAGE_LIMIT_BYTES) {
      throw new AppError(
        "This upload would exceed your 250 MB storage limit. Delete an older clip and try again.",
        413,
        "STORAGE_LIMIT",
      );
    }

    const filename = safeFilename(file.name);
    const [created] = await getDb().insert(clips).values({
      userId,
      title: titleFromFilename(file.name),
      originalFilename: filename,
      mimeType: file.type,
      byteSize: file.size,
      status: "transcribing",
    }).returning({ id: clips.id });
    clipId = created.id;

    const audio = Buffer.from(await file.arrayBuffer());
    const stored = await put(`audio/${created.id}/${filename}`, audio, {
      access: "private",
      addRandomSuffix: true,
      contentType: file.type,
    });
    storedBlobUrl = stored.url;
    await getDb().update(clips).set({
      blobUrl: stored.url,
      updatedAt: new Date(),
    }).where(eq(clips.id, created.id));
    await recordUsage({ userId, clipId: created.id, operation: "upload" });
    safelyPersisted = true;

    after(async () => {
      await processClipTranscription({
        userId,
        clipId: created.id,
        provider: transcription.provider,
        apiKey: transcription.apiKey,
        model: transcription.model,
        audio,
        filename,
        mediaType: file.type,
      });
    });

    return Response.json({ clip: await getClipDTO(userId, created.id) }, { status: 201 });
  } catch (error) {
    if (clipId && !safelyPersisted) {
      if (storedBlobUrl) await del(storedBlobUrl).catch(() => undefined);
      await getDb().delete(clips).where(eq(clips.id, clipId)).catch(() => undefined);
    }
    if (!(error instanceof AppError)) {
      console.error("Clip upload failed", safeErrorDetails(error));
      return errorResponse(
        new AppError("The recording could not be saved. Please try again.", 502, "UPLOAD_FAILED"),
      );
    }
    return errorResponse(error);
  }
}
