import { cookies } from "next/headers";
import {
  createHash,
  randomBytes,
  randomUUID
} from "node:crypto";

import prisma from "./prisma";

const COOKIE_NAME = "school_session";

const SESSION_DURATION =
  7 * 24 * 60 * 60 * 1000;


// ایجاد نشست ورود مدیر

export async function createSession(userId) {

  const token = randomBytes(32).toString("hex");

  const tokenHash = createHash("sha256")
    .update(token)
    .digest("hex");

  const expiresAt = new Date(
    Date.now() + SESSION_DURATION
  );

  // Logins are rare, so this is a cheap moment to drop sessions that
  // expired without a logout; nothing else ever removes them.
  await prisma.session.deleteMany({
    where: { expiresAt: { lte: new Date() } }
  });

  await prisma.session.create({
    data: {
      id: randomUUID(),
      userId,
      tokenHash,
      expiresAt
    }
  });

  const cookieStore = await cookies();

  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt
  });

}


// دریافت کاربر واردشده

export async function getCurrentUser() {

  const cookieStore = await cookies();

  const token =
    cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const tokenHash = createHash("sha256")
    .update(token)
    .digest("hex");

  const session =
    await prisma.session.findUnique({
      where: {
        tokenHash
      },
      include: {
        user: true
      }
    });

  if (!session) {
    return null;
  }

  if (session.expiresAt <= new Date()) {
    await prisma.session.deleteMany({
      where: { id: session.id }
    });

    return null;
  }

  if (!session.user.isActive) {
    return null;
  }

  return session.user;

}


// خروج امن از سامانه

export async function deleteSession() {

  const cookieStore = await cookies();

  const token =
    cookieStore.get(COOKIE_NAME)?.value;

  if (token) {

    const tokenHash = createHash("sha256")
      .update(token)
      .digest("hex");

    await prisma.session.deleteMany({
      where: {
        tokenHash
      }
    });

  }

  cookieStore.delete(COOKIE_NAME);

}


// Sign the user out everywhere except the browser making this request,
// e.g. after a password change, so a leaked password stops working at
// once. Returns how many other sessions were ended.

export async function endOtherSessions(userId) {

  const cookieStore = await cookies();

  const token =
    cookieStore.get(COOKIE_NAME)?.value;

  const currentHash = token
    ? createHash("sha256").update(token).digest("hex")
    : null;

  const result = await prisma.session.deleteMany({
    where: {
      userId,
      ...(currentHash ? { tokenHash: { not: currentHash } } : {})
    }
  });

  return result.count;

}
