import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const createDb = (databaseUrl: string) => drizzle(neon(databaseUrl), { schema });

type DatabaseClient = ReturnType<typeof createDb>;

let cachedDb: DatabaseClient | null = null;

export function getDb() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return null;
  }

  if (!cachedDb) {
    cachedDb = createDb(databaseUrl);
  }

  return cachedDb;
}
