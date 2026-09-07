import { del } from "@vercel/blob";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clips, conversationScopes } from "@/db/schema";
import { getClipDTO, getOwnedClipRow } from "@/data/clips";
import { requireUserId } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/errors";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { clipUpdateSchema, parseJson, uuidSchema } from "@/lib/server/validation";

type Context = { params: Promise<{ clipId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("read", userId);
    const clipId = uuidSchema.parse((await context.params).clipId);
    return Response.json({ clip: await getClipDTO(userId, clipId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("write", userId);
    const clipId = uuidSchema.parse((await context.params).clipId);
    await getOwnedClipRow(userId, clipId);
    const update = await parseJson(request, clipUpdateSchema, 300_000);
    const nextUpdate = update.transcript === undefined
      ? update
      : { ...update, summary: "" };
    await getDb()
      .update(clips)
      .set({ ...nextUpdate, updatedAt: new Date() })
      .where(and(eq(clips.id, clipId), eq(clips.userId, userId)));
    return Response.json({ clip: await getClipDTO(userId, clipId) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("write", userId);
    const clipId = uuidSchema.parse((await context.params).clipId);
    const clip = await getOwnedClipRow(userId, clipId);
    if (clip.blobUrl) await del(clip.blobUrl);
    await getDb()
      .delete(conversationScopes)
      .where(
        and(
          eq(conversationScopes.userId, userId),
          sql`${conversationScopes.clipIds} @> ${JSON.stringify([clipId])}::jsonb`,
        ),
      );
    await getDb()
      .delete(clips)
      .where(and(eq(clips.id, clipId), eq(clips.userId, userId)));
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
