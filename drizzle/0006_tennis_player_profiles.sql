CREATE TABLE IF NOT EXISTS "tennis_player_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"sportradar_competitor_id" text,
	"country" text,
	"country_code" text,
	"abbreviation" text,
	"gender" text,
	"singles_ranking" integer,
	"singles_ranking_movement" integer,
	"singles_ranking_points" integer,
	"singles_ranking_name" text,
	"race_ranking" integer,
	"race_ranking_movement" integer,
	"race_ranking_points" integer,
	"race_ranking_name" text,
	"raw_ranking_payload" jsonb,
	"raw_race_payload" jsonb,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tennis_player_profiles_player_name_unique" ON "tennis_player_profiles" USING btree ("player_name");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tennis_player_profiles_normalized_name_unique" ON "tennis_player_profiles" USING btree ("normalized_name");
