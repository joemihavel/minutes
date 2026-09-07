import "server-only";

import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { clips, usageEvents } from "@/db/schema";
import type { Provider, UsageDTO } from "@/lib/types";

export async function recordUsage(input: {
  userId: string;
  clipId?: string;
  provider?: Provider;
  model?: string;
  operation: "transcription" | "chat" | "upload" | "share_view";
  audioSeconds?: number;
  inputTokens?: number;
  outputTokens?: number;
}) {
  await getDb().insert(usageEvents).values({
    userId: input.userId,
    clipId: input.clipId,
    provider: input.provider,
    model: input.model,
    operation: input.operation,
    audioSeconds: input.audioSeconds ?? 0,
    inputTokens: input.inputTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
  });
}

export async function getUsage(userId: string): Promise<UsageDTO> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const [daily, storage] = await Promise.all([
    getDb()
      .select({
        transcriptionSecondsToday: sql<number>`coalesce(sum(case when ${usageEvents.operation} = 'transcription' then ${usageEvents.audioSeconds} else 0 end), 0)::int`,
        transcriptionRequestsToday: sql<number>`coalesce(sum(case when ${usageEvents.operation} = 'transcription' then ${usageEvents.requestCount} else 0 end), 0)::int`,
        chatRequestsToday: sql<number>`coalesce(sum(case when ${usageEvents.operation} = 'chat' then ${usageEvents.requestCount} else 0 end), 0)::int`,
        inputTokensToday: sql<number>`coalesce(sum(${usageEvents.inputTokens}), 0)::int`,
        outputTokensToday: sql<number>`coalesce(sum(${usageEvents.outputTokens}), 0)::int`,
      })
      .from(usageEvents)
      .where(
        and(eq(usageEvents.userId, userId), gte(usageEvents.createdAt, start)),
      ),
    getDb()
      .select({ storedBytes: sql<number>`coalesce(sum(${clips.byteSize}), 0)::int` })
      .from(clips)
      .where(eq(clips.userId, userId)),
  ]);
  return {
    transcriptionSecondsToday: daily[0]?.transcriptionSecondsToday ?? 0,
    transcriptionRequestsToday: daily[0]?.transcriptionRequestsToday ?? 0,
    chatRequestsToday: daily[0]?.chatRequestsToday ?? 0,
    inputTokensToday: daily[0]?.inputTokensToday ?? 0,
    outputTokensToday: daily[0]?.outputTokensToday ?? 0,
    storedBytes: storage[0]?.storedBytes ?? 0,
  };
}
