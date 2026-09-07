CREATE TYPE "public"."clip_status" AS ENUM('uploading', 'transcribing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."provider" AS ENUM('groq', 'google');--> statement-breakpoint
CREATE TYPE "public"."usage_operation" AS ENUM('transcription', 'chat', 'upload', 'share_view');--> statement-breakpoint
CREATE TABLE "clips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"title" varchar(160) NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"byte_size" integer NOT NULL,
	"duration_seconds" integer,
	"blob_url" text,
	"transcript" text DEFAULT '' NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"language" varchar(24),
	"status" "clip_status" DEFAULT 'uploading' NOT NULL,
	"error_message" varchar(280),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"clip_id" uuid PRIMARY KEY NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_connections" (
	"user_id" varchar(128) NOT NULL,
	"provider" "provider" NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" varchar(64) NOT NULL,
	"auth_tag" varchar(64) NOT NULL,
	"key_hint" varchar(16) NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "provider_connections_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(64) NOT NULL,
	"clip_id" uuid NOT NULL,
	"owner_id" varchar(128) NOT NULL,
	"include_audio" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"clip_id" uuid,
	"provider" "provider",
	"model" varchar(120),
	"operation" "usage_operation" NOT NULL,
	"request_count" integer DEFAULT 1 NOT NULL,
	"audio_seconds" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_clip_id_clips_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."clips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_clip_id_clips_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."clips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_clip_id_clips_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."clips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clips_user_updated_idx" ON "clips" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "clips_user_status_idx" ON "clips" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "conversations_user_idx" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shares_slug_idx" ON "shares" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "shares_active_clip_idx" ON "shares" USING btree ("clip_id");--> statement-breakpoint
CREATE INDEX "shares_owner_idx" ON "shares" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "usage_user_created_idx" ON "usage_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_operation_created_idx" ON "usage_events" USING btree ("operation","created_at");