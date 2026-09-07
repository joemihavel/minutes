import "server-only";

import { del, get, head } from "@vercel/blob";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { clips } from "@/db/schema";
import { getClipDTO, getOwnedClipRow } from "@/data/clips";
import { recordUsage } from "@/data/usage";
import { isClientUploadPath } from "@/lib/clip-helpers";
import type { ClipDTO } from "@/lib/types";
import { AppError, safeErrorDetails } from "@/lib/server/errors";
import {
  markClipTranscriptionFailed,
  processClipTranscription,
} from "@/lib/server/process-clip";
import { getTranscriptionProvider } from "@/lib/server/transcription-provider";

export async function completeClientUpload(input: {
  userId: string;
  clipId: string;
  blobUrl: string;
}): Promise<{
  clip: ClipDTO;
  shouldTranscribe: boolean;
}> {
  const clip = await getOwnedClipRow(input.userId, input.clipId);
  if (clip.blobUrl) {
    if (clip.blobUrl !== input.blobUrl) {
      throw new AppError("This upload does not match the saved clip.", 409, "UPLOAD_MISMATCH");
    }
    return { clip: await getClipDTO(input.userId, input.clipId), shouldTranscribe: false };
  }

  let metadata;
  try {
    metadata = await head(input.blobUrl);
  } catch {
    throw new AppError("The uploaded audio could not be verified. Please try again.", 422, "UPLOAD_UNVERIFIED");
  }

  const contentType = metadata.contentType.split(";")[0]?.toLowerCase();
  const expectedType = clip.mimeType.split(";")[0]?.toLowerCase();
  if (!isClientUploadPath(metadata.pathname, input.clipId)) {
    throw new AppError("This upload does not belong to the selected clip.", 422, "UPLOAD_MISMATCH");
  }
  if (metadata.size !== clip.byteSize || contentType !== expectedType) {
    await del(input.blobUrl).catch(() => undefined);
    throw new AppError("The uploaded audio did not match the selected file.", 422, "UPLOAD_MISMATCH");
  }

  const [updated] = await getDb()
    .update(clips)
    .set({
      blobUrl: metadata.url,
      status: "transcribing",
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(clips.id, input.clipId),
        eq(clips.userId, input.userId),
        isNull(clips.blobUrl),
      ),
    )
    .returning({ id: clips.id });

  if (!updated) {
    return { clip: await getClipDTO(input.userId, input.clipId), shouldTranscribe: false };
  }

  await recordUsage({
    userId: input.userId,
    clipId: input.clipId,
    operation: "upload",
  }).catch((error) => {
    console.error("Upload usage recording failed", safeErrorDetails(error));
  });
  return { clip: await getClipDTO(input.userId, input.clipId), shouldTranscribe: true };
}

export async function transcribeClientUpload(input: {
  userId: string;
  clipId: string;
  blobUrl: string;
}) {
  try {
    const [clip, transcription, stored] = await Promise.all([
      getOwnedClipRow(input.userId, input.clipId),
      getTranscriptionProvider(input.userId),
      get(input.blobUrl, { access: "private", useCache: false }),
    ]);
    if (!stored || stored.statusCode !== 200) {
      throw new AppError("The saved audio could not be loaded.", 404, "AUDIO_UNAVAILABLE");
    }
    const audio = Buffer.from(await new Response(stored.stream).arrayBuffer());
    await processClipTranscription({
      userId: input.userId,
      clipId: input.clipId,
      provider: transcription.provider,
      apiKey: transcription.apiKey,
      model: transcription.model,
      audio,
      filename: clip.originalFilename,
      mediaType: clip.mimeType,
    });
  } catch (error) {
    await markClipTranscriptionFailed(input.clipId, error);
  }
}
