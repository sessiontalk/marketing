import crypto from "crypto";

export function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  const got = Buffer.from(signature);
  const want = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch (was surfacing as a 500).
  if (got.length !== want.length) return false;
  return crypto.timingSafeEqual(got, want);
}