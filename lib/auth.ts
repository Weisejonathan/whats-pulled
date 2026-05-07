import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const SESSION_COOKIE = "wp_admin_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

type SessionPayload = {
  role: "admin";
  exp: number;
};

const getAuthSecret = () =>
  process.env.AUTH_SECRET ?? process.env.DATABASE_URL ?? "local-development-secret";

const getExpectedAccessCode = () => {
  if (process.env.ADMIN_ACCESS_CODE) {
    return process.env.ADMIN_ACCESS_CODE;
  }

  return process.env.NODE_ENV === "production" ? null : "dev-access";
};

export const getSafeRedirectPath = (value: string | null | undefined) => {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
};

const sign = (payload: string) =>
  createHmac("sha256", getAuthSecret()).update(payload).digest("base64url");

const createToken = () => {
  const payload: SessionPayload = {
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
};

const isValidToken = (token: string | undefined) => {
  if (!token) {
    return false;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return false;
  }

  const expectedSignature = sign(encodedPayload);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as SessionPayload;

    return payload.role === "admin" && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
};

export async function hasAdminSession() {
  const cookieStore = await cookies();
  return isValidToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function requireAdminSession(nextPath = "/") {
  if (await hasAdminSession()) {
    return;
  }

  redirect(`/login?next=${encodeURIComponent(getSafeRedirectPath(nextPath))}`);
}

export async function loginWithAccessCode(accessCode: string) {
  const expectedAccessCode = getExpectedAccessCode();

  if (!expectedAccessCode || accessCode !== expectedAccessCode) {
    return false;
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createToken(), {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return true;
}

export async function logoutAdmin() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
