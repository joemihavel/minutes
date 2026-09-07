CREATE TABLE "custom_ai_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"name" varchar(80) NOT NULL,
	"provider_name" varchar(80) NOT NULL,
	"base_url" text NOT NULL,
	"model_id" varchar(160) NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" varchar(64) NOT NULL,
	"auth_tag" varchar(64) NOT NULL,
	"key_hint" varchar(16) NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "custom_ai_models_user_idx" ON "custom_ai_models" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "custom_ai_models_user_endpoint_model_idx" ON "custom_ai_models" USING btree ("user_id","base_url","model_id");--> statement-breakpoint
UPDATE "provider_connections"
SET "chat_model" = 'openai/gpt-oss-120b', "updated_at" = now()
WHERE "provider" = 'groq' AND "chat_model" = 'qwen/qwen3.6-27b';
