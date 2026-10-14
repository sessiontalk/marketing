import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { verifyWebhookSignature } from "../src/lib/auth";

const secret = "test-secret";
const body = JSON.stringify({ event: "signup", email: "a@example.com" });
const valid = crypto.createHmac("sha256", secret).update(body).digest("hex");

test("empty signature is rejected without throwing", () => {
  assert.equal(verifyWebhookSignature(body, "", secret), false);
});

test("short signature is rejected without throwing", () => {
  assert.equal(verifyWebhookSignature(body, "deadbeef", secret), false);
});

test("wrong same-length signature is rejected", () => {
  const wrong = valid.replace(/.$/, valid.endsWith("0") ? "1" : "0");
  assert.equal(verifyWebhookSignature(body, wrong, secret), false);
});

test("valid signature is accepted", () => {
  assert.equal(verifyWebhookSignature(body, valid, secret), true);
});