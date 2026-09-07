CREATE TABLE "conversation_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"scope_key" varchar(64) NOT NULL,
	"clip_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_scopes_user_key_idx" ON "conversation_scopes" USING btree ("user_id","scope_key");--> statement-breakpoint
CREATE INDEX "conversation_scopes_user_updated_idx" ON "conversation_scopes" USING btree ("user_id","updated_at");