import "../lib/db/load-env";
import { Pool, type QueryResult } from "pg";
import { readFile, stat } from "node:fs/promises";
import { migrateMediaValue, parseBlobHosts, rewriteMedia } from "../lib/storage/migration";

const quote = (name: string) => '"' + name.replace(/"/g, '""') + '"';
const command = process.argv[2] || "audit";
const apply = process.argv.includes("--apply");
const backup = process.argv.find((arg) => arg.startsWith("--backup="))?.slice(9);

async function main() {
  if (!["audit", "prepare", "migrate-media", "verify"].includes(command)) throw new Error("Use audit, prepare, migrate-media, or verify.");
  const url = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required.");
  if (apply && command === "migrate-media") {
    if (!backup || !(await stat(backup)).isFile() || !(await stat(backup)).size) throw new Error("A verified database backup is required: --backup=/absolute/path/to/backup.dump");
    if (!process.argv.includes("--maintenance-window")) throw new Error("Pause writes and deploy the R2 reader before using --maintenance-window.");
  }
  const db = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000 });
  const hosts = parseBlobHosts(process.env.LEGACY_BLOB_HOSTS);
  try {
    await db.query("SET statement_timeout = '60s'");
    if (command === "prepare") {
      if (apply) await db.query(await readFile(new URL("../drizzle/0005_direct_upload_verifications.sql", import.meta.url), "utf8"));
      console.log(apply ? "Direct-upload table ensured; existing records were preserved." : "Read-only: would ensure the direct_upload_verifications table using migration 0005. Pass --apply after backup.");
      return;
    }
    const size = await db.query("select pg_database_size(current_database())::text as database_bytes");
    console.log(size.rows[0]);
    const tables = await db.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name");
    if (!tables.rows.some((table) => table.table_name === "direct_upload_verifications")) console.log({ missingTable: "direct_upload_verifications", action: "Run storage:prepare after backup, before testing direct uploads." });
    let candidates = 0, changed = 0, unconfiguredBlobReferences = 0;
    for (const { table_name: table } of tables.rows) {
      const name = `public.${quote(table)}`;
      const count = await db.query(`select count(*)::text as rows, pg_total_relation_size($1::regclass)::text as bytes from ${name}`, [name]);
      console.log({ table, ...count.rows[0] });
      const columns = await db.query<{ column_name: string; data_type: string }>("select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position", [table]);
      if (!columns.rows.some((col) => col.column_name === "id" && col.data_type === "uuid")) continue;
      for (const col of columns.rows.filter((col) => ["text", "jsonb", "json"].includes(col.data_type))) {
        const column = quote(col.column_name);
        let cursor: string | null = null;
        for (;;) {
          // One value at a time keeps base64 videos from exhausting local memory.
          const rows: QueryResult<{ id: string; value: unknown }> = await db.query(`select id, ${column} as value from ${name} where ($1::uuid is null or id > $1::uuid) and (${column}::text like '%data:image/%' or ${column}::text like '%data:video/%' or ${column}::text like '%public.blob.vercel-storage.com%') order by id limit 1`, [cursor]);
          const row = rows.rows[0];
          if (!row) break;
          cursor = row.id;
          const serialized = typeof row.value === "string" ? row.value : JSON.stringify(row.value);
          const foundHosts = serialized.match(/[a-z0-9-]+\.public\.blob\.vercel-storage\.com/g) || [];
          for (const host of foundHosts) {
            if (!hosts.has(host)) {
              unconfiguredBlobReferences++;
              console.log({ table, column: col.column_name, missingLegacyBlobHost: host });
            }
          }
          let found = 0;
          const next = await rewriteMedia(row.value, async (value) => {
            found++;
            if (command !== "migrate-media" || !apply) return value;
            return migrateMediaValue(value, table === "direct_upload_verifications" ? "private" : "public", hosts);
          }, hosts);
          candidates += found;
          if (found && command === "migrate-media" && apply) {
            const json = col.data_type !== "text";
            const cast = json ? `::${col.data_type}` : "::text";
            const result = await db.query(`update ${name} set ${column}=$1${cast} where id=$2 and ${column}::text is not distinct from ($3${cast})::text`, [json ? JSON.stringify(next) : next, row.id, json ? JSON.stringify(row.value) : row.value]);
            if (result.rowCount !== 1) throw new Error("A record changed during migration. Stop writers and rerun; original media remains intact.");
            changed++;
          }
        }
      }
    }
    console.log({ mode: apply ? command : "read-only", mediaReferences: candidates, changedFields: changed, unconfiguredBlobReferences });
    if (command === "verify" && (candidates || unconfiguredBlobReferences)) throw new Error("Legacy media remains. Migration is not complete.");
  } finally { await db.end(); }
}

main().catch((error: unknown) => {
  // Database/SDK errors can contain credentials or complete parameter values.
  console.error(error instanceof Error && !('code' in error) && !('query' in error) ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[database URL]") : "Maintenance failed. Check database access/configuration; no source files were deleted.");
  process.exitCode = 1;
});
