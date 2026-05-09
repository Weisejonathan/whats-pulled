CREATE TYPE "public"."break_session_status" AS ENUM('setup', 'live', 'paused', 'ended');--> statement-breakpoint
CREATE TYPE "public"."recognition_status" AS ENUM('pending', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TABLE "break_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"breaker_id" uuid,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"overlay_key" text NOT NULL,
	"stream_platform" text,
	"obs_scene_name" text,
	"status" "break_session_status" DEFAULT 'setup' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "break_sessions_slug_unique" UNIQUE("slug"),
	CONSTRAINT "break_sessions_overlay_key_unique" UNIQUE("overlay_key")
);
--> statement-breakpoint
CREATE TABLE "recognition_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"card_id" uuid,
	"raw_set_name" text,
	"raw_card_number" text,
	"raw_player_name" text,
	"raw_card_name" text,
	"limitation" text,
	"is_autographed" boolean DEFAULT false NOT NULL,
	"confidence" numeric(5, 4),
	"frame_image_url" text,
	"source" text DEFAULT 'obs-local' NOT NULL,
	"status" "recognition_status" DEFAULT 'pending' NOT NULL,
	"payload" jsonb,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "break_sessions" ADD CONSTRAINT "break_sessions_breaker_id_breakers_id_fk" FOREIGN KEY ("breaker_id") REFERENCES "public"."breakers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognition_events" ADD CONSTRAINT "recognition_events_session_id_break_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."break_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognition_events" ADD CONSTRAINT "recognition_events_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;
