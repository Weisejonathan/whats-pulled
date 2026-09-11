import "../lib/db/load-env";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Pool } from "pg";

const quote = (value: string) => '"' + value.replace(/"/g, '""') + '"';

function databaseEnv(connection: string) {
  const url = new URL(connection);
  if (!["postgresql:", "postgres:"].includes(url.protocol)) throw new Error("A PostgreSQL URL is required.");
  // Secrets go through the child environment, never command arguments or logs.
  return { ...process.env, PGHOST: url.searchParams.get("host") || url.hostname, PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)), PGSSLMODE: url.searchParams.get("sslmode") || "require",
    PGSSLROOTCERT: url.searchParams.get("sslrootcert") || process.env.PGSSLROOTCERT,
    PGCONNECT_TIMEOUT: "15" };
}

async function pgTool(tool: string, args: string[], connection: string, output?: string) {
  const child = spawn(tool, args, { env: databaseEnv(connection), stdio: ["ignore", "pipe", "pipe"] });
  // Never print pg_dump/restore stderr: it may contain connection details or row data.
  child.stderr.resume();
  const finished = new Promise<void>((resolve, reject) => {
    child.once("error", () => reject(new Error(`${tool} could not start. Install PostgreSQL client tools matching the source server version.`)));
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${tool} failed. Check client version, database access and schema compatibility; keep the source database.`)));
  });
  let captured = "";
  if (output) {
    const file = createWriteStream(output, { flags: "wx", mode: 0o600 });
    try { await Promise.all([finished, pipeline(child.stdout, file)]); }
    catch (error) { child.kill(); throw error; }
  } else { child.stdout.on("data", (chunk: Buffer) => { captured += chunk.toString(); }); await finished; }
  return captured;
}

async function fingerprint(connection: string) {
  const db = new Pool({ connectionString: connection, max: 1, connectionTimeoutMillis: 10_000 });
  try {
    await db.query("begin isolation level repeatable read read only");
    // Timestamp JSON depends on the session timezone, not only stored values.
    // Normalize both providers before computing content fingerprints.
    await db.query("set local timezone = 'UTC'");
    await db.query("set local datestyle = 'ISO, YMD'");
    const tables = await db.query<{ tablename: string }>("select tablename from pg_tables where schemaname='public' order by tablename");
    const result: Record<string, { rows: number; sha256: string }> = {};
    for (const { tablename } of tables.rows) {
      const digest = createHash("sha256");
      // Server-side cursor streams fixed-size row hashes instead of large image values.
      await db.query(`declare migration_rows no scroll cursor for select md5(to_jsonb(t)::text) as hash from public.${quote(tablename)} t order by md5(to_jsonb(t)::text)`);
      let count = 0;
      for (;;) {
        const batch = await db.query<{ hash: string }>("fetch 1000 from migration_rows");
        if (!batch.rows.length) break;
        for (const row of batch.rows) digest.update(row.hash + "\n");
        count += batch.rows.length;
      }
      await db.query("close migration_rows");
      result[tablename] = { rows: count, sha256: digest.digest("hex") };
    }
    await db.query("commit");
    return result;
  } finally { await db.end(); }
}

async function main() {
  const [command, file] = process.argv.slice(2);
  const source = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  const target = process.env.TARGET_DATABASE_DIRECT_URL;
  if (!source) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required.");
  if (command === "backup") {
    if (!file?.endsWith(".dump")) throw new Error("Provide a new .dump filename in a private backup directory.");
    await pgTool("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", "--schema=public", "--schema=drizzle"], source, file);
    await pgTool("pg_restore", ["--list", file], source);
    console.log("Backup created and archive structure verified. Test restore before cutover; no database was changed.");
    return;
  }
  if (!target || target === source) throw new Error("A separate TARGET_DATABASE_DIRECT_URL is required.");
  if (!process.argv.includes("--maintenance-window")) throw new Error("Pause all source and target writers before restore/compare; then pass --maintenance-window.");
  if (command === "restore") {
    if (!process.argv.includes("--apply")) throw new Error("Restore requires --apply and a fresh target database.");
    if (!file || !(await stat(file)).size) throw new Error("A non-empty backup archive is required.");
    const replaceStaging = process.argv.includes("--replace-staging");
    if (replaceStaging) {
      const targetBackup = process.argv.find((arg) => arg.startsWith("--target-backup="))?.slice(16);
      if (!targetBackup || targetBackup === file || !(await stat(targetBackup)).size) throw new Error("Replacing a staging copy requires a separate verified --target-backup=FILE.dump.");
      await pgTool("pg_restore", ["--list", targetBackup], target);
    }
    const db = new Pool({ connectionString: target, max: 1, connectionTimeoutMillis: 10_000 });
    try {
      const existing = await db.query("select tablename from pg_tables where schemaname in ('public','drizzle')");
      if (existing.rows.length && !replaceStaging) throw new Error("Target contains application tables. Restore is limited to an empty target; nothing was removed.");
    } finally { await db.end(); }
    // Supabase and initdb already create public. Keep the target's ownership and
    // access policy instead of recreating/dropping that schema during restore.
    const contents = await pgTool("pg_restore", ["--list", file], target);
    const restoreList = contents.split("\n").filter((line) => !/\bSCHEMA - public\b|\bCOMMENT - SCHEMA public\b/.test(line)).join("\n");
    const scratch = await mkdtemp(join(tmpdir(), "whats-pulled-restore-"));
    try {
      const listFile = join(scratch, "restore.list");
      await writeFile(listFile, restoreList, { mode: 0o600 });
      await pgTool("pg_restore", ["--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", ...(replaceStaging ? ["--clean", "--if-exists"] : []), "--use-list", listFile, "--dbname", databaseEnv(target).PGDATABASE, file], target);
    } finally { await rm(scratch, { recursive: true, force: true }); }
    console.log("Archive restored. Run compare and application tests before changing DATABASE_URL.");
    return;
  }
  if (command === "compare") {
    const original = await fingerprint(source);
    const restored = await fingerprint(target);
    if (JSON.stringify(original) !== JSON.stringify(restored)) throw new Error("Source and target row counts/content differ. Do not cut over.");
    console.log({ verifiedTables: Object.keys(original).length, rows: Object.values(original).reduce((sum, table) => sum + table.rows, 0), identical: true });
    return;
  }
  throw new Error("Use backup FILE.dump, restore FILE.dump --apply --maintenance-window, or compare --maintenance-window.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error && !('code' in error) ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, "[database URL]") : "Database transfer failed. Check access and configuration; the source was not modified.");
  process.exitCode = 1;
});
