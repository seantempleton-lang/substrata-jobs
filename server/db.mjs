import pg from "pg";

const { Pool } = pg;
// Calendar dates stay date-only even when the API host uses NZ local time.
pg.types.setTypeParser(1082, value => value);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export function query(text, params = []) {
  return pool.query(text, params);
}

export async function closePool() {
  await pool.end();
}
