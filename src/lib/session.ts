const COOKIE_NAME = "st_crm_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export { COOKIE_NAME, SESSION_TTL_MS };

function getSigningKey(): string {
  return process.env.WEBHOOK_SECRET || process.env.ADMIN_PASSWORD || "";
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSessionToken(username: string): Promise<string> {
  const secret = getSigningKey();
  if (!secret) throw new Error("No signing key configured");

  const payload = {
    u: username,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadB64)
  );
  return `${payloadB64}.${toBase64Url(sig)}`;
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<{ u: string; exp: number } | null> {
  if (!token) return null;
  const secret = getSigningKey();
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  try {
    const key = await importHmacKey(secret);
    const sigBytes = fromBase64Url(sigB64);
    // Copy into a plain ArrayBuffer-backed view for TS BufferSource compatibility
    const sigCopy = new Uint8Array(sigBytes.byteLength);
    sigCopy.set(sigBytes);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigCopy,
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;

    const json = new TextDecoder().decode(fromBase64Url(payloadB64));
    const payload = JSON.parse(json) as { u?: string; exp?: number };
    if (!payload.u || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return { u: payload.u, exp: payload.exp };
  } catch {
    return null;
  }
}
