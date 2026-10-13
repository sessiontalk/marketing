import { cookies } from "next/headers";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

/** Current cookie-session username for CRM UI defaults (performedBy, etc.). */
export async function getCrmSessionUser(): Promise<string | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);
  return session?.u ?? null;
}
