import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { UIMessage } from "ai";
import type { TranscriptSegment } from "@/lib/types";

export const providerEnum = pgEnum("provider", ["groq", "google"]);
export const clipStatusEnum = pgEnum("clip_status", [
  "uploading",
  "transcribing",
  "ready",
  "failed",
]);
export const usageOperationEnum = pgEnum("usage_operation", [
  "transcription",
  "chat",
  "upload",
  "share_view",
]);

export const providerConnections = pgTable(
  "provider_connections",
  {
    userId: varchar("user_id", { length: 128 }).notNull(),
    provider: providerEnum("provider").notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: varchar("iv", { length: 64 }).notNull(),
    authTag: varchar("auth_tag", { length: 64 }).notNull(),
    keyHint: varchar("key_hint", { length: 16 }).notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    transcriptionModel: varchar("transcription_model", { length: 120 }),
    chatModel: varchar("chat_model", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.provider] })],
);

export const customAiModels = pgTable(
  "custom_ai_models",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id", { length: 128 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    providerName: varchar("provider_name", { length: 80 }).notNull(),
    baseUrl: text("base_url").notNull(),
    modelId: varchar("model_id", { length: 160 }).notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: varchar("iv", { length: 64 }).notNull(),
    authTag: varchar("auth_tag", { length: 64 }).notNull(),
    keyHint: varchar("key_hint", { length: 16 }).notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("custom_ai_models_user_idx").on(table.userId, table.updatedAt),
    uniqueIndex("custom_ai_models_user_endpoint_model_idx").on(
      table.userId,
      table.baseUrl,
      table.modelId,
    ),
  ],
);

export const clips = pgTable(
  "clips",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id", { length: 128 }).notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    durationSeconds: integer("duration_seconds"),
    blobUrl: text("blob_url"),
    transcript: text("transcript").notNull().default(""),
    summary: text("summary").notNull().default(""),
    segments: jsonb("segments").$type<TranscriptSegment[]>().notNull().default([]),
    language: varchar("language", { length: 24 }),
    status: clipStatusEnum("status").notNull().default("uploading"),
    errorMessage: varchar("error_message", { length: 280 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("clips_user_updated_idx").on(table.userId, table.updatedAt),
    index("clips_user_status_idx").on(table.userId, table.status),
  ],
);

export const shares = pgTable(
  "shares",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull(),
    clipId: uuid("clip_id")
      .notNull()
      .references(() => clips.id, { onDelete: "cascade" }),
    ownerId: varchar("owner_id", { length: 128 }).notNull(),
    includeAudio: boolean("include_audio").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    viewCount: integer("view_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("shares_slug_idx").on(table.slug),
    uniqueIndex("shares_active_clip_idx").on(table.clipId),
    index("shares_owner_idx").on(table.ownerId),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    clipId: uuid("clip_id")
      .primaryKey()
      .references(() => clips.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 128 }).notNull(),
    messages: jsonb("messages").$type<UIMessage[]>().notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("conversations_user_idx").on(table.userId)],
);

export const conversationScopes = pgTable(
  "conversation_scopes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id", { length: 128 }).notNull(),
    scopeKey: varchar("scope_key", { length: 64 }).notNull(),
    clipIds: jsonb("clip_ids").$type<string[]>().notNull().default([]),
    messages: jsonb("messages").$type<UIMessage[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("conversation_scopes_user_key_idx").on(table.userId, table.scopeKey),
    index("conversation_scopes_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id", { length: 128 }).notNull(),
    clipId: uuid("clip_id").references(() => clips.id, { onDelete: "set null" }),
    provider: providerEnum("provider"),
    model: varchar("model", { length: 120 }),
    operation: usageOperationEnum("operation").notNull(),
    requestCount: integer("request_count").notNull().default(1),
    audioSeconds: integer("audio_seconds").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("usage_user_created_idx").on(table.userId, table.createdAt),
    index("usage_operation_created_idx").on(table.operation, table.createdAt),
  ],
);
