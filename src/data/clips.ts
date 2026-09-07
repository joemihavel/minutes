import "server-only";

import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clips, shares } from "@/db/schema";
import type { ClipDTO } from "@/lib/types";
import { AppError } from "@/lib/server/errors";

type ClipRow = typeof clips.$inferSelect;

function toDTO(row: ClipRow, share?: { slug: string; includeAudio: boolean } | null): ClipDTO {
  return {
    id: row.id,
    title: row.title,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    durationSeconds: row.durationSeconds,
    transcript: row.transcript,
    summary: row.summary,
    segments: row.segments,
    language: row.language,
    status: row.status,
    errorMessage: row.errorMessage,
    hasAudio: Boolean(row.blobUrl),
    shareSlug: share?.slug ?? null,
    shareIncludesAudio: share?.includeAudio ?? false,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listClips(userId: string): Promise<ClipDTO[]> {
  const rows = await getDb()
    .select({ clip: clips, shareSlug: shares.slug, includeAudio: shares.includeAudio })
    .from(clips)
    .leftJoin(
      shares,
      and(eq(shares.clipId, clips.id), isNull(shares.revokedAt)),
    )
    .where(eq(clips.userId, userId))
    .orderBy(desc(clips.updatedAt));
  return rows.map(({ clip, shareSlug, includeAudio }) =>
    toDTO(
      clip,
      shareSlug ? { slug: shareSlug, includeAudio: includeAudio ?? false } : null,
    ),
  );
}

export async function getOwnedClipRow(userId: string, clipId: string) {
  const [row] = await getDb()
    .select()
    .from(clips)
    .where(and(eq(clips.id, clipId), eq(clips.userId, userId)))
    .limit(1);
  if (!row) throw new AppError("Audio clip not found.", 404, "NOT_FOUND");
  return row;
}

export async function getOwnedClipRows(userId: string, clipIds: string[]) {
  const uniqueIds = [...new Set(clipIds)];
  const rows = await getDb()
    .select()
    .from(clips)
    .where(and(eq(clips.userId, userId), inArray(clips.id, uniqueIds)));
  if (rows.length !== uniqueIds.length) {
    throw new AppError("One or more audio clips could not be found.", 404, "NOT_FOUND");
  }
  const positions = new Map(uniqueIds.map((id, index) => [id, index]));
  return rows.sort((a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0));
}

export async function getClipDTO(userId: string, clipId: string) {
  const row = await getOwnedClipRow(userId, clipId);
  const [share] = await getDb()
    .select({ slug: shares.slug, includeAudio: shares.includeAudio })
    .from(shares)
    .where(and(eq(shares.clipId, clipId), isNull(shares.revokedAt)))
    .limit(1);
  return toDTO(row, share ?? null);
}

export async function recordShareView(slug: string) {
  await getDb()
    .update(shares)
    .set({ viewCount: sql`${shares.viewCount} + 1` })
    .where(and(eq(shares.slug, slug), isNull(shares.revokedAt)));
}

export async function getPublicShare(slug: string) {
  const [row] = await getDb()
    .select({
      share: shares,
      clip: clips,
    })
    .from(shares)
    .innerJoin(clips, eq(clips.id, shares.clipId))
    .where(eq(shares.slug, slug))
    .limit(1);
  if (
    !row ||
    row.share.revokedAt ||
    (row.share.expiresAt && row.share.expiresAt <= new Date())
  ) {
    throw new AppError("This shared transcript is unavailable.", 404, "NOT_FOUND");
  }
  return {
    id: row.clip.id,
    title: row.clip.title,
    transcript: row.clip.transcript,
    summary: row.clip.summary,
    segments: row.clip.segments,
    durationSeconds: row.clip.durationSeconds,
    language: row.clip.language,
    includeAudio: row.share.includeAudio && Boolean(row.clip.blobUrl),
    createdAt: row.clip.createdAt.toISOString(),
  };
}
