import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(repoRoot, "db");
const command = process.argv[2] ?? "up";

function isMigrationFile(name) {
  return /^\d+_.+\.sql$/i.test(name);
}

async function getMigrationFiles() {
  return (await fs.readdir(migrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && isMigrationFile(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function checksumFor(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function ensureMigrationsTable(client) {
  await client.query("create schema if not exists jobs_app");
  await client.query(`
    create table if not exists jobs_app.schema_migrations (
      id bigserial primary key,
      filename text not null unique,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
}

async function migrationFor(filename) {
  const sql = await fs.readFile(path.join(migrationsDir, filename), "utf8");
  return { filename, sql, checksum: checksumFor(sql) };
}

async function main() {
  const connectionString = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required.");

  const client = new Client({
    connectionString,
    ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();
  try {
    await ensureMigrationsTable(client);
    const appliedResult = await client.query("select filename, checksum, applied_at from jobs_app.schema_migrations order by filename");
    const applied = new Map(appliedResult.rows.map((row) => [row.filename, row]));

    for (const filename of await getMigrationFiles()) {
      const migration = await migrationFor(filename);
      const existing = applied.get(filename);
      if (command === "status") {
        console.log(existing ? `[applied] ${filename}` : `[pending] ${filename}`);
        continue;
      }
      if (existing?.checksum === migration.checksum) {
        console.log(`Skipping ${filename} (already applied).`);
        continue;
      }
      if (existing) throw new Error(`Migration ${filename} changed after application. Add a new migration instead.`);

      console.log(`Applying ${filename}...`);
      await client.query("begin");
      try {
        await client.query(migration.sql);
        await client.query("insert into jobs_app.schema_migrations (filename, checksum) values ($1, $2)", [filename, migration.checksum]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
