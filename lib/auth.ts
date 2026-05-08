import "server-only";
import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

const ADMIN_SESSION_COOKIE = "wp_admin_session";
const USER_SESSION_COOKIE = "wp_user_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

type AdminSessionPayload = {
  role: "admin";
  exp: number;
};

export type UserSession = {
  id: string;
  displayName: string;
  email: string;
};

type UserSessionPayload = UserSession & {
  role: "user";
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

const createToken = (payload: AdminSessionPayload | UserSessionPayload) => {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
};

const createAdminToken = () =>
  createToken({
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  });

const createUserToken = (user: UserSession) =>
  createToken({
    ...user,
    role: "user",
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  });

const readSignedPayload = (token: string | undefined) => {
  if (!token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = sign(encodedPayload);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as
      | AdminSessionPayload
      | UserSessionPayload;
  } catch {
    return null;
  }
};

export async function hasAdminSession() {
  const cookieStore = await cookies();
  const payload = readSignedPayload(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  return payload?.role === "admin" && payload.exp > Math.floor(Date.now() / 1000);
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
  cookieStore.set(ADMIN_SESSION_COOKIE, createAdminToken(), {
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
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

export const hashPassword = (password: string) => {
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("base64url");
  return `${salt}.${hash}`;
};

export const verifyPassword = (password: string, storedHash: string) => {
  const [salt, hash] = storedHash.split(".");

  if (!salt || !hash) {
    return false;
  }

  const candidate = pbkdf2Sync(password, salt, 120_000, 32, "sha256").toString("base64url");
  const provided = Buffer.from(candidate);
  const expected = Buffer.from(hash);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
};

export async function getUserSession(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  const payload = readSignedPayload(cookieStore.get(USER_SESSION_COOKIE)?.value);

  if (payload?.role !== "user" || payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return {
    id: payload.id,
    displayName: payload.displayName,
    email: payload.email,
  };
}

export async function requireUserSession(nextPath = "/") {
  const session = await getUserSession();

  if (session) {
    return session;
  }

  redirect(`/login?next=${encodeURIComponent(getSafeRedirectPath(nextPath))}`);
}

export async function registerUser(displayName: string, email: string, password: string) {
  const db = getDb();

  if (!db) {
    throw new Error("DATABASE_URL is missing.");
  }

  const normalizedEmail = email.toLowerCase();
  const [user] = await db
    .insert(users)
    .values({
      displayName,
      email: normalizedEmail,
      passwordHash: hashPassword(password),
    })
    .returning({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
    });

  const cookieStore = await cookies();
  cookieStore.set(USER_SESSION_COOKIE, createUserToken(user), {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export async function loginUser(email: string, password: string) {
  const db = getDb();

  if (!db) {
    throw new Error("DATABASE_URL is missing.");
  }

  const [user] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return false;
  }

  const cookieStore = await cookies();
  cookieStore.set(
    USER_SESSION_COOKIE,
    createUserToken({
      id: user.id,
      displayName: user.displayName,
      email: user.email,
    }),
    {
      httpOnly: true,
      maxAge: SESSION_MAX_AGE,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  );

  return true;
}

export async function logoutUser() {
  const cookieStore = await cookies();
  cookieStore.delete(USER_SESSION_COOKIE);
}
