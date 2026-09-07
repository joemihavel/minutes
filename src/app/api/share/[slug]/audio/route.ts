import { get } from "@vercel/blob";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { getDb } from "@/db";
import { clips, shares } from "@/db/schema";
import { anonymousFingerprint } from "@/lib/server/crypto";
import { AppError, errorResponse } from "@/lib/server/errors";
import { enforceRateLimit } from "@/lib/server/rate-limit";

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const slug = (await context.params).slug;
    if (!/^[A-Za-z0-9_-]{32}$/.test(slug)) {
      throw new AppError("Audio is unavailable.", 404, "NOT_FOUND");
    }
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    await enforceRateLimit("public", anonymousFingerprint(forwarded));
    const [row] = await getDb()
      .select({ blobUrl: clips.blobUrl, mimeType: clips.mimeType })
      .from(shares)
      .innerJoin(clips, eq(clips.id, shares.clipId))
      .where(
        and(
          eq(shares.slug, slug),
          isNull(shares.revokedAt),
          eq(shares.includeAudio, true),
          or(isNull(shares.expiresAt), gt(shares.expiresAt, new Date())),
        ),
      )
      .limit(1);
    if (!row?.blobUrl) throw new AppError("Audio is unavailable.", 404, "NOT_FOUND");
    const result = await get(row.blobUrl, { access: "private" });
    if (!result || result.statusCode !== 200) {
      throw new AppError("Audio is unavailable.", 404, "NOT_FOUND");
    }
    return new Response(result.stream, {
      headers: {
        "Content-Type": row.mimeType,
        "Content-Length": String(result.blob.size),
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": "inline",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
