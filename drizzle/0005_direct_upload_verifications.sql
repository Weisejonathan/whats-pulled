CREATE TABLE IF NOT EXISTS "direct_upload_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"verification_code" text NOT NULL,
	"video_data_url" text NOT NULL,
	"card_image_data_url" text NOT NULL,
	"card_image_file_name" text,
	"card_image_file_size" integer,
	"card_image_mime_type" text,
	"file_name" text,
	"file_size" integer,
	"mime_type" text,
	"status" "verification_status" DEFAULT 'pending' NOT NULL,
	"notes" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "direct_upload_verifications_verification_code_unique" UNIQUE("verification_code")
);
