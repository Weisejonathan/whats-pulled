import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const cardStatusEnum = pgEnum("card_status", [
  "open",
  "pulled",
  "claimed",
  "available",
  "sold",
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "pending",
  "verified",
  "rejected",
]);

export const listingStatusEnum = pgEnum("listing_status", [
  "active",
  "paused",
  "sold",
]);

export const breakSessionStatusEnum = pgEnum("break_session_status", [
  "setup",
  "live",
  "paused",
  "ended",
]);

export const recognitionStatusEnum = pgEnum("recognition_status", [
  "pending",
  "confirmed",
  "rejected",
]);

export const cardSets = pgTable("sets", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  brand: text("brand").notNull(),
  year: integer("year").notNull(),
  sport: text("sport").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const breakers = pgTable("breakers", {
  id: uuid("id").defaultRandom().primaryKey(),
  displayName: text("display_name").notNull(),
  slug: text("slug").notNull().unique(),
  country: text("country"),
  verified: boolean("verified").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const stores = pgTable("stores", {
  id: uuid("id").defaultRandom().primaryKey(),
  displayName: text("display_name").notNull(),
  slug: text("slug").notNull().unique(),
  country: text("country"),
  verified: boolean("verified").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const cards = pgTable("cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  setId: uuid("set_id")
    .notNull()
    .references(() => cardSets.id, { onDelete: "cascade" }),
  playerName: text("player_name").notNull(),
  slug: text("slug").notNull().unique(),
  cardName: text("card_name").notNull(),
  cardNumber: integer("card_number"),
  parallel: text("parallel"),
  serialNumber: text("serial_number").notNull(),
  printRun: integer("print_run"),
  status: cardStatusEnum("status").default("open").notNull(),
  estimatedValue: numeric("estimated_value", { precision: 12, scale: 2 }),
  imageUrl: text("image_url"),
  sourceUrl: text("source_url"),
  sourceName: text("source_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const pullReports = pgTable("pull_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id")
    .notNull()
    .references(() => cards.id, { onDelete: "cascade" }),
  breakerId: uuid("breaker_id").references(() => breakers.id, { onDelete: "set null" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  reportedByName: text("reported_by_name"),
  proofUrl: text("proof_url"),
  copyNumber: integer("copy_number"),
  externalRef: text("external_ref").unique(),
  pulledAt: timestamp("pulled_at", { withTimezone: true }),
  estimatedValue: numeric("estimated_value", { precision: 12, scale: 2 }),
  verificationStatus: verificationStatusEnum("verification_status")
    .default("pending")
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const leaderboardSeasons = pgTable("leaderboard_seasons", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  interval: text("interval").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  prizeTitle: text("prize_title"),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userPointEvents = pgTable("user_point_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  pullReportId: uuid("pull_report_id").references(() => pullReports.id, {
    onDelete: "set null",
  }),
  externalRef: text("external_ref").notNull().unique(),
  eventType: text("event_type").default("approved_pull").notNull(),
  points: integer("points").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const claims = pgTable("claims", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id")
    .notNull()
    .references(() => cards.id, { onDelete: "cascade" }),
  ownerDisplayName: text("owner_display_name").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  proofUrl: text("proof_url"),
  imageUrl: text("image_url"),
  copyNumber: integer("copy_number"),
  note: text("note"),
  externalRef: text("external_ref").unique(),
  verificationStatus: verificationStatusEnum("verification_status")
    .default("pending")
    .notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const listings = pgTable("listings", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id")
    .notNull()
    .references(() => cards.id, { onDelete: "cascade" }),
  storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").default("USD").notNull(),
  imageUrl: text("image_url"),
  externalRef: text("external_ref").unique(),
  status: listingStatusEnum("status").default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const cardFavorites = pgTable("card_favorites", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id")
    .notNull()
    .references(() => cards.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  userDisplayName: text("user_display_name"),
  userEmail: text("user_email").notNull(),
  externalRef: text("external_ref").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const cardBids = pgTable("card_bids", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id")
    .notNull()
    .references(() => cards.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  copyNumber: integer("copy_number"),
  bidderDisplayName: text("bidder_display_name").notNull(),
  bidderEmail: text("bidder_email").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").default("EUR").notNull(),
  note: text("note"),
  status: verificationStatusEnum("status").default("pending").notNull(),
  externalRef: text("external_ref").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const breakSessions = pgTable("break_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  breakerId: uuid("breaker_id").references(() => breakers.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  overlayKey: text("overlay_key").notNull().unique(),
  streamPlatform: text("stream_platform"),
  obsSceneName: text("obs_scene_name"),
  status: breakSessionStatusEnum("status").default("setup").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const recognitionEvents = pgTable("recognition_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => breakSessions.id, { onDelete: "cascade" }),
  cardId: uuid("card_id").references(() => cards.id, { onDelete: "set null" }),
  rawSetName: text("raw_set_name"),
  rawCardNumber: text("raw_card_number"),
  rawPlayerName: text("raw_player_name"),
  rawCardName: text("raw_card_name"),
  limitation: text("limitation"),
  isAutographed: boolean("is_autographed").default(false).notNull(),
  confidence: numeric("confidence", { precision: 5, scale: 4 }),
  frameImageUrl: text("frame_image_url"),
  source: text("source").default("obs-local").notNull(),
  status: recognitionStatusEnum("status").default("pending").notNull(),
  payload: jsonb("payload"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const detectorTrainingSamples = pgTable("detector_training_samples", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id").references(() => cards.id, { onDelete: "set null" }),
  sessionId: uuid("session_id").references(() => breakSessions.id, { onDelete: "set null" }),
  imageDataUrl: text("image_data_url").notNull(),
  playerName: text("player_name"),
  setName: text("set_name"),
  cardName: text("card_name"),
  cardNumber: text("card_number"),
  limitation: text("limitation"),
  isAutographed: boolean("is_autographed").default(false).notNull(),
  source: text("source").default("detector-application").notNull(),
  notes: text("notes"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const directUploadVerifications = pgTable("direct_upload_verifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  verificationCode: text("verification_code").notNull().unique(),
  videoDataUrl: text("video_data_url").notNull(),
  cardImageDataUrl: text("card_image_data_url").notNull(),
  cardImageFileName: text("card_image_file_name"),
  cardImageFileSize: integer("card_image_file_size"),
  cardImageMimeType: text("card_image_mime_type"),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  status: verificationStatusEnum("status").default("pending").notNull(),
  notes: text("notes"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
