// Turn "database unreachable" failures into a JSON 503 instead of a bare 500.
// Only connection-level errors are mapped; everything else is rethrown unchanged
// (so Next still reports genuine bugs as 500). Auth checks inside the wrapped
// handler (requireApiKey, webhook HMAC, CRON_SECRET) still run first, because
// they run before any DB call.

const CONNECTION_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "53300", // too_many_connections
]);

const CONNECTION_MESSAGES = [
  /timeout exceeded when trying to connect/i, // pg Pool connectionTimeoutMillis
  /connection terminated/i, // pg client lost its socket
  /Connection terminated unexpectedly/i,
];

export const DB_UNAVAILABLE_BODY = { error: "database unavailable" } as const;
export const DB_RETRY_AFTER_SECONDS = 30;

type ErrLike = { name?: unknown; code?: unknown; message?: unknown; cause?: unknown };

/** True when `err` (or anything in its `cause` chain) means the DB could not be reached. */
export function isDbUnavailableError(err: unknown, depth = 0): boolean {
  if (!err || typeof err !== "object" || depth > 5) return false;
  const e = err as ErrLike;
  const code = typeof e.code === "string" ? e.code : "";
  if (CONNECTION_CODES.has(code)) return true;
  if (/^08[0-9A-Z]{3}$/.test(code)) return true; // class 08: connection exception
  if (e.name === "NeonDbError") return true; // while still on Neon (e.g. HTTP 402 over quota)
  const msg = typeof e.message === "string" ? e.message : "";
  if (CONNECTION_MESSAGES.some((re) => re.test(msg))) return true;
  if (Array.isArray((e as { errors?: unknown }).errors)) {
    // AggregateError from net.connect (IPv4 + IPv6 both refused)
    if (((e as { errors: unknown[] }).errors).some((x) => isDbUnavailableError(x, depth + 1))) return true;
  }
  return isDbUnavailableError(e.cause, depth + 1);
}

export function dbUnavailableResponse(): Response {
  return Response.json(DB_UNAVAILABLE_BODY, {
    status: 503,
    headers: { "Retry-After": String(DB_RETRY_AFTER_SECONDS) },
  });
}

/** Wrap a route handler so DB connection failures return 503 JSON + Retry-After: 30. */
export function withDbErrors<A extends unknown[], R extends Response>(
  handler: (...args: A) => Promise<R>,
): (...args: A) => Promise<R | Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (!isDbUnavailableError(err)) throw err;
      const e = err as ErrLike;
      // Class and code only; never the message (it can carry host names).
      console.error(JSON.stringify({ level: "error", msg: "db_unavailable", name: String(e?.name ?? "Error"), code: typeof e?.code === "string" ? e.code : null }));
      return dbUnavailableResponse();
    }
  };
}
