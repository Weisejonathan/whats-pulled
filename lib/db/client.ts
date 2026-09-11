import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Standard PostgreSQL works with Supabase's transaction pooler and with Neon
// during migration. Unnamed queries also work through transaction pooling.
const createDb = (databaseUrl: string) => {
  const certificate = process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n");
  const connection = new URL(databaseUrl);
  if (certificate) {
    // URL SSL options override node-postgres's ssl object. Keep certificate and
    // hostname verification enabled when using the provider's supplied CA.
    for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) connection.searchParams.delete(key);
  }
  const pool = new Pool({
    connectionString: connection.href,
    ...(certificate ? { ssl: { ca: certificate, rejectUnauthorized: true } } : {}),
    max: 3,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  pool.on("error", () => console.error("An idle database connection failed."));
  return drizzle(pool, { schema });
};

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
