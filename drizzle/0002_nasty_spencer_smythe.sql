CREATE TABLE "detector_training_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid,
	"session_id" uuid,
	"image_data_url" text NOT NULL,
	"player_name" text,
	"set_name" text,
	"card_name" text,
	"card_number" text,
	"limitation" text,
	"is_autographed" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'detector-application' NOT NULL,
	"notes" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "detector_training_samples" ADD CONSTRAINT "detector_training_samples_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detector_training_samples" ADD CONSTRAINT "detector_training_samples_session_id_break_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."break_sessions"("id") ON DELETE set null ON UPDATE no action;