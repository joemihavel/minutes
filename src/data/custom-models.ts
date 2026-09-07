import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customAiModels } from "@/db/schema";
import type { CustomModelDTO } from "@/lib/types";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { AppError } from "@/lib/server/errors";

const MAX_CUSTOM_MODELS = 12;

function toDTO(row: typeof customAiModels.$inferSelect): CustomModelDTO {
  return {
    id: row.id,
    name: row.name,
    providerName: row.providerName,
    baseUrl: row.baseUrl,
    modelId: row.modelId,
    keyHint: row.keyHint,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCustomModels(userId: string): Promise<CustomModelDTO[]> {
  const rows = await getDb()
    .select()
    .from(customAiModels)
    .where(eq(customAiModels.userId, userId))
    .orderBy(desc(customAiModels.updatedAt));
  return rows.map(toDTO);
}

export async function saveCustomModel(input: {
  userId: string;
  name: string;
  providerName: string;
  baseUrl: string;
  modelId: string;
  apiKey: string;
}) {
  const existing = await getDb()
    .select({ id: customAiModels.id })
    .from(customAiModels)
    .where(and(
      eq(customAiModels.userId, input.userId),
      eq(customAiModels.baseUrl, input.baseUrl),
      eq(customAiModels.modelId, input.modelId),
    ))
    .limit(1);

  if (!existing.length) {
    const models = await listCustomModels(input.userId);
    if (models.length >= MAX_CUSTOM_MODELS) {
      throw new AppError(`You can save up to ${MAX_CUSTOM_MODELS} custom models.`, 409, "CUSTOM_MODEL_LIMIT");
    }
  }

  const id = existing[0]?.id ?? randomUUID();
  const encrypted = encryptSecret(input.apiKey, input.userId, `custom-model:${id}`);
  const keyHint = input.apiKey.slice(-4).padStart(8, "•");
  await getDb()
    .insert(customAiModels)
    .values({
      id,
      userId: input.userId,
      name: input.name,
      providerName: input.providerName,
      baseUrl: input.baseUrl,
      modelId: input.modelId,
      keyHint,
      ...encrypted,
    })
    .onConflictDoUpdate({
      target: customAiModels.id,
      set: {
        name: input.name,
        providerName: input.providerName,
        baseUrl: input.baseUrl,
        modelId: input.modelId,
        keyHint,
        ...encrypted,
        updatedAt: new Date(),
      },
    });
}

export async function deleteCustomModel(userId: string, id: string) {
  await getDb()
    .delete(customAiModels)
    .where(and(eq(customAiModels.id, id), eq(customAiModels.userId, userId)));
}

export async function getCustomModelConfig(userId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(customAiModels)
    .where(and(eq(customAiModels.id, id), eq(customAiModels.userId, userId)))
    .limit(1);
  if (!row) {
    throw new AppError("That custom model is no longer available.", 404, "CUSTOM_MODEL_NOT_FOUND");
  }
  return {
    name: row.name,
    providerName: row.providerName,
    baseUrl: row.baseUrl,
    modelId: row.modelId,
    apiKey: decryptSecret(row, userId, `custom-model:${row.id}`),
  };
}
