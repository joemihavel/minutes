import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { shares } from "@/db/schema";
import { getOwnedClipRow } from "@/data/clips";
import { requireUserId } from "@/lib/server/auth";
import { errorResponse } from "@/lib/server/errors";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { parseJson, shareSchema, uuidSchema } from "@/lib/server/validation";

type Context = { params: Promise<{ clipId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit("write", userId);
    const clipId = uuidSchema.parse((await context.params).clipId);
    await getOwnedClipRow(userId, clipId);
    const { includeAudio, expiresInDays } = await parseJson(request, shareSchema);
    const slug = randomBytes(24).toString("base64url");
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86_400_000)
      : null;
    const [share] = await getDb()
      .insert(shares)
      .values({ slug, clipId, ownerId: userId, includeAudio, expiresAt })
      .onConflictDoUpdate({
        target: shares.clipId,
        set: {
          slug,
          includeAudio,
          expiresAt,
          revokedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning({ slug: shares.slug, includeAudio: shares.includeAudio });
    return Response.json({ share });
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
    await getDb()
      .update(shares)
      .set({ revokedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(shares.clipId, clipId), eq(shares.ownerId, userId)));
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
