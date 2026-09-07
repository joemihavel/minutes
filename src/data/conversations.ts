import "server-only";

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { getDb } from "@/db";
import { conversationScopes, conversations } from "@/db/schema";

export async function loadConversation(userId: string, clipId: string) {
  const [row] = await getDb()
    .select({ messages: conversations.messages })
    .from(conversations)
    .where(
      and(eq(conversations.clipId, clipId), eq(conversations.userId, userId)),
    )
    .limit(1);
  return row?.messages ?? [];
}

export async function saveConversation(
  userId: string,
  clipId: string,
  messages: UIMessage[],
) {
  await getDb()
    .insert(conversations)
    .values({ clipId, userId, messages, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: conversations.clipId,
      set: { messages, updatedAt: new Date() },
    });
}

function scopeKey(clipIds: string[]) {
  return createHash("sha256")
    .update([...new Set(clipIds)].sort().join(":"), "utf8")
    .digest("hex");
}

export async function loadScopedConversation(userId: string, clipIds: string[]) {
  const [row] = await getDb()
    .select({ messages: conversationScopes.messages })
    .from(conversationScopes)
    .where(
      and(
        eq(conversationScopes.userId, userId),
        eq(conversationScopes.scopeKey, scopeKey(clipIds)),
      ),
    )
    .limit(1);
  if (row) return row.messages;
  // Preserve chat history created before conversations supported multiple clips.
  if (clipIds.length === 1) return loadConversation(userId, clipIds[0]);
  return [];
}

export async function saveScopedConversation(
  userId: string,
  clipIds: string[],
  messages: UIMessage[],
) {
  const ids = [...new Set(clipIds)].sort();
  const key = scopeKey(ids);
  await getDb()
    .insert(conversationScopes)
    .values({ userId, scopeKey: key, clipIds: ids, messages, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [conversationScopes.userId, conversationScopes.scopeKey],
      set: { clipIds: ids, messages, updatedAt: new Date() },
    });
}
