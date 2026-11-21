import { sql } from "drizzle-orm";
import { db } from "@/db";
import { healthResponse } from "@/lib/health";

export const dynamic = "force-dynamic";

// GET /api/worker/health → 200 {"ok":true,"db":"up"} | 503 {"ok":false,"db":"down"}.
// Lives under the already-public /api/worker/ prefix, so the middleware
// allowlist is unchanged. Used by the droplet's uptime check and Docker HEALTHCHECK.
export async function GET() {
  return healthResponse(() => db.execute(sql`select 1`));
}
