import crypto from "crypto";

export function generateUnsubscribeToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function getUnsubscribeUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${baseUrl}/api/unsubscribe?token=${token}`;
}
