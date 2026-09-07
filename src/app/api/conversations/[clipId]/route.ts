import { getOwnedClipRow } from "@/data/clips";
import { loadConversation, saveConversation } from "@/data/conversations";
import { requireUserId } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/errors";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { uuidSchema } from "@/lib/server/validation";

type Context = { params: Promise<{ clipId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("read", userId);
    const clipId = uuidSchema.parse((await context.params).clipId);
    await getOwnedClipRow(userId, clipId);
    return Response.json({ messages: await loadConversation(userId, clipId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("write", userId);
    const clipId = uuidSchema.parse((await context.params).clipId);
    await getOwnedClipRow(userId, clipId);
    await saveConversation(userId, clipId, []);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
