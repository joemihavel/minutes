import { get } from "@vercel/blob";
import { getOwnedClipRow } from "@/data/clips";
import { requireUserId } from "@/lib/server/auth";
import { AppError, errorResponse } from "@/lib/server/errors";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { uuidSchema } from "@/lib/server/validation";

type Context = { params: Promise<{ clipId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("read", userId);
    const clipId = uuidSchema.parse((await context.params).clipId);
    const clip = await getOwnedClipRow(userId, clipId);
    if (!clip.blobUrl) throw new AppError("Audio is unavailable.", 404, "NOT_FOUND");
    const result = await get(clip.blobUrl, { access: "private" });
    if (!result || result.statusCode !== 200) {
      throw new AppError("Audio is unavailable.", 404, "NOT_FOUND");
    }
    return new Response(result.stream, {
      headers: {
        "Content-Type": clip.mimeType,
        "Content-Length": String(result.blob.size),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
