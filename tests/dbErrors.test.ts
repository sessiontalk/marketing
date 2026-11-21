import { test } from "node:test";
import assert from "node:assert/strict";
import { isDbUnavailableError, withDbErrors, DB_UNAVAILABLE_BODY } from "../src/lib/dbErrors";
import { poolMax } from "../src/db/index";

function withCode(code: string, message = "x") {
  return Object.assign(new Error(message), { code });
}

test("connection-level errors are recognised", () => {
  for (const code of ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "57P01", "57P03", "53300", "08006", "08001"]) {
    assert.equal(isDbUnavailableError(withCode(code)), true, code);
  }
  assert.equal(isDbUnavailableError(new Error("timeout exceeded when trying to connect")), true);
  assert.equal(isDbUnavailableError(new Error("Connection terminated unexpectedly")), true);
  assert.equal(isDbUnavailableError(Object.assign(new Error("402"), { name: "NeonDbError" })), true);
  assert.equal(isDbUnavailableError(new Error("wrapped", { cause: withCode("ECONNREFUSED") })), true);
  const agg = new AggregateError([withCode("ECONNREFUSED"), withCode("ECONNREFUSED")], "connect");
  assert.equal(isDbUnavailableError(agg), true);
});

test("query and app errors are not treated as DB-unavailable", () => {
  assert.equal(isDbUnavailableError(withCode("23505")), false); // unique_violation
  assert.equal(isDbUnavailableError(withCode("42P01")), false); // undefined_table
  assert.equal(isDbUnavailableError(new TypeError("boom")), false);
  assert.equal(isDbUnavailableError(null), false);
  assert.equal(isDbUnavailableError("ECONNREFUSED"), false);
});

test("withDbErrors maps connection errors to 503 JSON with Retry-After: 30", async () => {
  const h = withDbErrors(async () => { throw withCode("ECONNREFUSED"); });
  const res = await h();
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("retry-after"), "30");
  assert.deepEqual(await res.json(), DB_UNAVAILABLE_BODY);
});

test("withDbErrors rethrows other errors unchanged", async () => {
  const boom = new TypeError("boom");
  const h = withDbErrors(async () => { throw boom; });
  await assert.rejects(h(), (e) => e === boom);
});

test("withDbErrors passes through responses and arguments (auth still runs first)", async () => {
  const h = withDbErrors(async (a: number, b: string) => Response.json({ a, b }, { status: 401 }));
  const res = await h(1, "x");
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { a: 1, b: "x" });
});

test("DB pool size defaults to 10 and honours DB_POOL_MAX", () => {
  assert.equal(poolMax(undefined), 10);
  assert.equal(poolMax("4"), 4);
  assert.equal(poolMax("0"), 10);
  assert.equal(poolMax("abc"), 10);
});
