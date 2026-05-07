import {
  boolean,
  integer,
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

export const cards = pgTable("cards", {
  id: uuid("id").defaultRandom().primaryKey(),
  setId: uuid("set_id")
    .notNull()
    .references(() => cardSets.id, { onDelete: "cascade" }),
  playerName: text("player_name").notNull(),
  slug: text("slug").notNull().unique(),
  cardName: text("card_name").notNull(),
  parallel: text("parallel"),
  serialNumber: text("serial_number").notNull(),
  status: cardStatusEnum("status").default("open").notNull(),
  estimatedValue: numeric("estimated_value", { precision: 12, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const pullReports = pgTable("pull_reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id")
    .notNull()
    .references(() => cards.id, { onDelete: "cascade" }),
  breakerId: uuid("breaker_id").references(() => breakers.id, { onDelete: "set null" }),
  reportedByName: text("reported_by_name"),
  proofUrl: text("proof_url"),
  externalRef: text("external_ref").unique(),
  pulledAt: timestamp("pulled_at", { withTimezone: true }),
  estimatedValue: numeric("estimated_value", { precision: 12, scale: 2 }),
  verificationStatus: verificationStatusEnum("verification_status")
    .default("pending")
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const claims = pgTable("claims", {
  id: uuid("id").defaultRandom().primaryKey(),
  cardId: uuid("card_id")
    .notNull()
    .references(() => cards.id, { onDelete: "cascade" }),
  ownerDisplayName: text("owner_display_name").notNull(),
  proofUrl: text("proof_url"),
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
