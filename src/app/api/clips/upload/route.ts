import { after } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { and, eq, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { clips } from "@/db/schema";
import { getOwnedClipRow } from "@/data/clips";
import { getUsage } from "@/data/usage";
import {
  clientUploadPath,
  safeFilename,
  titleFromFilename,
} from "@/lib/clip-helpers";
import { USER_STORAGE_LIMIT_BYTES } from "@/lib/limits";
import {
  completeClientUpload,
  transcribeClientUpload,
} from "@/lib/server/client-upload";
import { requireUserId } from "@/lib/server/auth";
import { AppError, errorResponse, safeErrorDetails } from "@/lib/server/errors";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getTranscriptionProvider } from "@/lib/server/transcription-provider";
import { validateAudioMetadata } from "@/lib/server/validation";

export const maxDuration = 300;

const uploadPayloadSchema = z.object({
  clipId: z.uuid(),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  size: z.number().int().positive().max(USER_STORAGE_LIMIT_BYTES),
});

const callbackPayloadSchema = z.object({
  clipId: z.uuid(),
  userId: z.string().min(1).max(128),
});

function parsePayload(value: string | null) {
  try {
    return uploadPayloadSchema.parse(JSON.parse(value ?? ""));
  } catch {
    throw new AppError("The upload details were invalid. Please select the file again.", 422, "INVALID_UPLOAD");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as HandleUploadBody;
    const callbackHost = process.env.VERCEL_URL;
    const callbackUrl = callbackHost
      ? `https://${callbackHost}/api/clips/upload`
      : undefined;
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const userId = await requireUserId();
        await enforceRateLimit("upload", userId);
        const input = parsePayload(clientPayload);
        validateAudioMetadata({
          name: input.filename,
          type: input.mimeType,
          size: input.size,
        });
        const filename = safeFilename(input.filename);
        if (pathname !== clientUploadPath(input.clipId, filename)) {
          throw new AppError("The upload destination was invalid.", 422, "INVALID_UPLOAD_PATH");
        }

        await Promise.all([
          getTranscriptionProvider(userId),
          getDb().delete(clips).where(
            and(
              eq(clips.userId, userId),
              eq(clips.status, "uploading"),
              isNull(clips.blobUrl),
              lt(clips.updatedAt, new Date(Date.now() - 60 * 60 * 1_000)),
            ),
          ),
        ]);
        const existing = await getDb().query.clips.findFirst({
          where: eq(clips.id, input.clipId),
        });
        if (!existing) {
          const usage = await getUsage(userId);
          if (usage.storedBytes + input.size > USER_STORAGE_LIMIT_BYTES) {
            throw new AppError(
              "There is not enough storage left for this recording. Delete an older clip and try again.",
              409,
              "STORAGE_LIMIT",
            );
          }
          await getDb().insert(clips).values({
            id: input.clipId,
            userId,
            title: titleFromFilename(input.filename),
            originalFilename: filename,
            mimeType: input.mimeType,
            byteSize: input.size,
            status: "uploading",
          }).onConflictDoNothing();
        }
        const pending = await getOwnedClipRow(userId, input.clipId);
        if (
          pending.originalFilename !== filename
          || pending.mimeType !== input.mimeType
          || pending.byteSize !== input.size
          || Boolean(pending.blobUrl)
        ) {
          throw new AppError("This upload ID is already in use.", 409, "UPLOAD_CONFLICT");
        }

        return {
          allowedContentTypes: [input.mimeType],
          maximumSizeInBytes: input.size,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ clipId: input.clipId, userId }),
          callbackUrl,
        };
      },
      ...(callbackUrl ? {
        onUploadCompleted: async ({ blob, tokenPayload }) => {
          const payload = callbackPayloadSchema.parse(JSON.parse(tokenPayload ?? ""));
          const completed = await completeClientUpload({
            userId: payload.userId,
            clipId: payload.clipId,
            blobUrl: blob.url,
          });
          if (completed.shouldTranscribe) {
            after(() => transcribeClientUpload({
              userId: payload.userId,
              clipId: payload.clipId,
              blobUrl: blob.url,
            }));
          }
        },
      } : {}),
    });
    return Response.json(result);
  } catch (error) {
    if (!(error instanceof AppError)) {
      console.error("Client upload route failed", safeErrorDetails(error));
    }
    return errorResponse(error);
  }
}
