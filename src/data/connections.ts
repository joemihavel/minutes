import "server-only";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { providerConnections } from "@/db/schema";
import { defaultModel } from "@/lib/models";
import type { ConnectionDTO, ModelCapability, Provider } from "@/lib/types";
import { decryptProviderKey, encryptProviderKey } from "@/lib/server/crypto";
import { AppError } from "@/lib/server/errors";

const providers: Provider[] = ["groq", "google"];

export async function listConnections(userId: string): Promise<ConnectionDTO[]> {
  const rows = await getDb()
    .select({
      provider: providerConnections.provider,
      keyHint: providerConnections.keyHint,
      updatedAt: providerConnections.updatedAt,
      transcriptionModel: providerConnections.transcriptionModel,
      chatModel: providerConnections.chatModel,
    })
    .from(providerConnections)
    .where(eq(providerConnections.userId, userId));
  const byProvider = new Map(rows.map((row) => [row.provider, row]));
  return providers.map((provider) => {
    const row = byProvider.get(provider);
    return {
      provider,
      connected: Boolean(row),
      keyHint: row?.keyHint ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      models: {
        transcription: row?.transcriptionModel ?? defaultModel(provider, "transcription"),
        chat: row?.chatModel ?? defaultModel(provider, "chat"),
      },
    };
  });
}

export async function updateConnectionModel(
  userId: string,
  provider: Provider,
  capability: ModelCapability,
  modelId: string,
) {
  const column = capability === "transcription"
    ? { transcriptionModel: modelId }
    : { chatModel: modelId };
  const updated = await getDb()
    .update(providerConnections)
    .set({ ...column, updatedAt: new Date() })
    .where(and(eq(providerConnections.userId, userId), eq(providerConnections.provider, provider)))
    .returning({ provider: providerConnections.provider });
  if (!updated.length) {
    throw new AppError(
      `Connect ${provider === "groq" ? "Groq" : "Google AI"} before selecting a model.`,
      409,
      "PROVIDER_NOT_CONNECTED",
    );
  }
}

export async function saveConnection(
  userId: string,
  provider: Provider,
  apiKey: string,
) {
  const encrypted = encryptProviderKey(apiKey, userId, provider);
  const keyHint = apiKey.slice(-4).padStart(8, "•");
  await getDb()
    .insert(providerConnections)
    .values({ userId, provider, keyHint, ...encrypted })
    .onConflictDoUpdate({
      target: [providerConnections.userId, providerConnections.provider],
      set: { keyHint, ...encrypted, updatedAt: new Date() },
    });
}

export async function deleteConnection(userId: string, provider: Provider) {
  await getDb()
    .delete(providerConnections)
    .where(
      and(
        eq(providerConnections.userId, userId),
        eq(providerConnections.provider, provider),
      ),
    );
}

export async function getProviderKey(userId: string, provider: Provider) {
  const [row] = await getDb()
    .select()
    .from(providerConnections)
    .where(
      and(
        eq(providerConnections.userId, userId),
        eq(providerConnections.provider, provider),
      ),
    )
    .limit(1);
  if (!row) {
    throw new AppError(
      `Connect ${provider === "groq" ? "Groq" : "Google AI"} before continuing.`,
      409,
      "PROVIDER_NOT_CONNECTED",
    );
  }
  return decryptProviderKey(row, userId, provider);
}

export async function getProviderConfig(userId: string, provider: Provider) {
  const [row] = await getDb()
    .select()
    .from(providerConnections)
    .where(and(eq(providerConnections.userId, userId), eq(providerConnections.provider, provider)))
    .limit(1);
  if (!row) {
    throw new AppError(
      `Connect ${provider === "groq" ? "Groq" : "Google AI"} before continuing.`,
      409,
      "PROVIDER_NOT_CONNECTED",
    );
  }
  return {
    apiKey: decryptProviderKey(row, userId, provider),
    models: {
      transcription: row.transcriptionModel ?? defaultModel(provider, "transcription"),
      chat: row.chatModel ?? defaultModel(provider, "chat"),
    },
  };
}
