import { getUsage } from "@/data/usage";
import { requireUserId } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/errors";
import { enforceRateLimit } from "@/lib/server/rate-limit";

export async function GET() {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("read", userId);
    return Response.json({ usage: await getUsage(userId) });
  } catch (error) {
    return errorResponse(error);
  }
}
