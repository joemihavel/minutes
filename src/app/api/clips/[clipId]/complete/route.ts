import { after } from "next/server";
import { z } from "zod";
import {
  completeClientUpload,
  transcribeClientUpload,
} from "@/lib/server/client-upload";
import { requireUserId } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/errors";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { parseJson, uuidSchema } from "@/lib/server/validation";

export const maxDuration = 300;

const completeUploadSchema = z.object({
  blobUrl: z.url(),
});

type Context = { params: Promise<{ clipId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("write", userId);
    const clipId = uuidSchema.parse((await context.params).clipId);
    const input = await parseJson(request, completeUploadSchema);
    const completed = await completeClientUpload({
      userId,
      clipId,
      blobUrl: input.blobUrl,
    });
    if (completed.shouldTranscribe) {
      after(() => transcribeClientUpload({
        userId,
        clipId,
        blobUrl: input.blobUrl,
      }));
    }
    return Response.json({ clip: completed.clip }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
