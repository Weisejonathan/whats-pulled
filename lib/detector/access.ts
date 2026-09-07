import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { hasAdminSession } from "@/lib/auth";
import type { DetectorAccess } from "./access-policy";

const COOKIE_NAME = "wp_detector_browser";

/** No account or login: an opaque, HttpOnly browser cookie owns the private queue. */
export async function getDetectorAccess(create = false): Promise<DetectorAccess> {
  const jar = await cookies();
  let token = jar.get(COOKIE_NAME)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    token = undefined;
    if (create) {
      token = randomBytes(32).toString("hex");
      jar.set(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
    }
  }
  return { isAdmin: await hasAdminSession(), ownerKey: token ? createHash("sha256").update(token).digest("hex") : null };
}
