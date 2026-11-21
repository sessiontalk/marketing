import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

type DB = NodePgDatabase<typeof schema>;

/** Pool size: DB_POOL_MAX (positive integer), default 10. */
export function poolMax(raw: string | undefined = process.env.DB_POOL_MAX): number {
  const n = Number(raw ?? 10);
  return Number.isInteger(n) && n > 0 ? n : 10;
}

// Lazy: the pg Pool and drizzle() are created on first use, not at import time,
// so `next build` can collect page data without DATABASE_URL. One pool per
// process (the droplet runs a single long-lived Node server).
let _db: DB | undefined;
function getDb(): DB {
  if (!_db) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: poolMax(),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    // An idle client erroring (e.g. Postgres restarted) must not crash the
    // process. Log the error class/code only, never the message or URL.
    pool.on("error", (err: Error & { code?: string }) => {
      console.error(JSON.stringify({ level: "error", msg: "pg_pool_error", name: err?.name ?? "Error", code: err?.code ?? null }));
    });
    _db = drizzle(pool, { schema });
  }
  return _db;
}

export const db = new Proxy({} as DB, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as Function).bind(real) : v;
  },
});
