import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { checkHealth, healthResponse } from "../src/lib/health";

const root = path.join(__dirname, "..");

test("health: DB answers → 200 {ok:true, db:up}", async () => {
  const res = await healthResponse(async () => [{ "?column?": 1 }]);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, db: "up" });
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("health: DB error → 503 {ok:false, db:down} with no error detail", async () => {
  const res = await healthResponse(async () => { throw Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" }); });
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.deepEqual(body, { ok: false, db: "down" });
  assert.equal(JSON.stringify(body).includes("5432"), false);
});

test("health: DB slower than the timeout → 503 down", async () => {
  const r = await checkHealth(() => new Promise((resolve) => setTimeout(resolve, 200)), 20);
  assert.equal(r.status, 503);
  assert.deepEqual(r.body, { ok: false, db: "down" });
});

test("health: synchronous throw from ping → 503 down", async () => {
  const r = await checkHealth(() => { throw new Error("sync"); });
  assert.equal(r.status, 503);
});

test("health route lives under /api/worker/ and the public allowlist is unchanged", () => {
  assert.equal(fs.existsSync(path.join(root, "src/app/api/worker/health/route.ts")), true);
  const mw = fs.readFileSync(path.join(root, "src/middleware.ts"), "utf8");
  const block = mw.match(/const PUBLIC_PREFIXES = \[([\s\S]*?)\];/);
  assert.ok(block, "PUBLIC_PREFIXES not found");
  const prefixes = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(prefixes, ["/api/events/", "/api/worker/", "/api/unsubscribe", "/api/auth/login", "/api/crm/"]);
});

test("Vercel crons are gone; droplet cron calls the same worker paths with Bearer CRON_SECRET", () => {
  assert.equal(fs.existsSync(path.join(root, "vercel.json")), false);
  const cron = fs.readFileSync(path.join(root, "deploy/cron.d/marketing-crm"), "utf8");
  assert.match(cron, /^\*\/5 +\* \* \* \* +crm +\/usr\/local\/bin\/crm-worker sequences$/m);
  assert.match(cron, /^\*\/10 +\* \* \* \* +crm +\/usr\/local\/bin\/crm-worker trial-nurture$/m);
  const worker = fs.readFileSync(path.join(root, "deploy/crm-worker.sh"), "utf8");
  assert.match(worker, /Authorization: Bearer %s/);
  assert.match(worker, /"\$\{CRON_SECRET\}"/);
  assert.match(worker, /curl --config -/); // secret on stdin, not argv
  assert.match(worker, /http:\/\/127\.0\.0\.1:3000\/api\/worker\//);
});

test(".env.example keeps DRIP_SENDING_ENABLED off (unset) by default", () => {
  const env = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  assert.equal(/^DRIP_SENDING_ENABLED=/m.test(env), false, "must be unset (commented out) by default");
});
