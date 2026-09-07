import { getOwnedClipRows } from "@/data/clips";
import { loadScopedConversation, saveScopedConversation } from "@/data/conversations";
import { requireUserId } from "@/lib/server/auth";
import { AppError, errorResponse } from "@/lib/server/errors";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { uuidSchema } from "@/lib/server/validation";

function parseClipIds(request: Request) {
  const values = new URL(request.url).searchParams.getAll("clipId");
  if (values.length < 1 || values.length > 5) {
    throw new AppError("Choose between one and five clips.", 422, "INVALID_CHAT_SCOPE");
  }
  return [...new Set(values.map((value) => uuidSchema.parse(value)))];
}

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("read", userId);
    const ids = parseClipIds(request);
    await getOwnedClipRows(userId, ids);
    return Response.json({ messages: await loadScopedConversation(userId, ids) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("write", userId);
    const ids = parseClipIds(request);
    await getOwnedClipRows(userId, ids);
    await saveScopedConversation(userId, ids, []);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
