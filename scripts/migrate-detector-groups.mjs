import { readFile } from "node:fs/promises";
import { Client } from "pg";

// This project has historical out-of-band schema changes. Apply only the
// additive detector migration, never replay the unrelated migration history.
if (process.env.VERCEL_ENV !== "production") {
  console.log("Detector grouping migration: skipped outside production deployment.");
} else {
  if (!process.env.DATABASE_URL) throw new Error("Production database is required before deploying detector grouping.");
  const connection = new URL(process.env.DATABASE_URL);
  const certificate = process.env.DATABASE_SSL_CA?.replace(/\\n/g, "\n");
  if (certificate) for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) connection.searchParams.delete(key);
  const client = new Client({ connectionString: connection.href, connectionTimeoutMillis: 15_000,
    ...(certificate ? { ssl: { ca: certificate, rejectUnauthorized: true } } : {}) });
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '15s'");
    await client.query("SET LOCAL statement_timeout = '45s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('detector-group-schema-v1', 0))");
    const prerequisites = await client.query("SELECT to_regclass('detector_observations') AS observations, to_regprocedure('approve_detector_observation(uuid,integer,text)') AS approval");
    if (!prerequisites.rows[0]?.observations || !prerequisites.rows[0]?.approval) throw new Error("Detector approval schema missing; refusing to migrate an unexpected database.");
    await client.query(await readFile(new URL("../drizzle/0010_detector_card_groups.sql", import.meta.url), "utf8"));
    await client.query(await readFile(new URL("../drizzle/0011_detector_exact_images.sql", import.meta.url), "utf8"));
    await client.query("COMMIT");
    console.log("Detector grouping migration: ready. Existing cards and pulls retained.");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    // Driver errors can include SQL parameters or credentials; keep build logs safe.
    console.error("Detector grouping migration failed; deployment stopped.", { code: error?.code || error?.name || "migration_failed" });
    process.exitCode = 1;
  } finally { await client.end(); }
}
