// Health check used by GET /api/worker/health (public via the existing
// /api/worker/ prefix; no middleware change). Reports only whether the DB
// answers `select 1` within the timeout: no version, counts or env.

export const HEALTH_DB_TIMEOUT_MS = 2000;

export type HealthBody = { ok: true; db: "up" } | { ok: false; db: "down" };

export async function checkHealth(
  ping: () => Promise<unknown>,
  timeoutMs: number = HEALTH_DB_TIMEOUT_MS,
): Promise<{ status: 200 | 503; body: HealthBody }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("health_db_timeout")), timeoutMs);
  });
  try {
    await Promise.race([Promise.resolve().then(ping), timeout]);
    return { status: 200, body: { ok: true, db: "up" } };
  } catch {
    return { status: 503, body: { ok: false, db: "down" } };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function healthResponse(ping: () => Promise<unknown>, timeoutMs?: number): Promise<Response> {
  const { status, body } = await checkHealth(ping, timeoutMs);
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
