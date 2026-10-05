import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createHash,
  randomBytes,
  randomUUID
} from "node:crypto";

import prisma from "./prisma";
import { canFinance } from "./finance-access";

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

  // Expired sessions are dropped nightly by scripts/cleanup-sessions.js.
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
    // Production is HTTPS only. The local copy is plain http, where browsers
    // keep a Secure cookie for localhost but drop it for a LAN address.
    secure: process.env.NODE_ENV !== "development",
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


// Sign the user out everywhere, this browser included, and sign this
// browser back in with a new token: after a password change a leaked
// password or session token stops working at once. Returns how many
// other sessions were ended.

export async function rotateSessions(userId) {

  const result = await prisma.session.deleteMany({
    where: { userId }
  });

  await createSession(userId);

  // The one deleted for this browser is not "other".
  return Math.max(result.count - 1, 0);

}


// For API routes that only admins may use (the default in this codebase):
//   const { user, response } = await requireAdmin();
//   if (response) return response;
// response is the 401 to send when there is no signed-in admin.

export async function requireAdmin() {

  const user = await getCurrentUser();

  if (user?.role === "ADMIN") {
    return { user, response: null };
  }

  return {
    user: null,
    response: Response.json(
      { error: "ليس لديك صلاحية الوصول." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    )
  };

}


// For API routes of the rest of the site (children, parents, receipts,
// sections, lines): an admin or a معاون.
// Users, backups and starting a year stay requireAdmin.

export async function requireOffice() {

  const user = await getCurrentUser();

  if (user?.role === "ADMIN" || user?.role === "DEPUTY") {
    return { user, response: null };
  }

  return {
    user: null,
    response: Response.json(
      { error: "ليس لديك صلاحية الوصول." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    )
  };

}


// For API routes of المالية: an admin, or a معاون given `tab` (any of
// them, for an array) — to change it when `write`. A معاون without it
// gets 403, not 401: 401 means signed out and sends the browser to /login.

export async function requireFinance(tab, write = false) {

  const user = await getCurrentUser();
  const tabs = Array.isArray(tab) ? tab : [tab];

  if (user && tabs.some((t) => canFinance(user, t, write))) {
    return { user, response: null };
  }

  return {
    user: null,
    response: Response.json(
      { error: "ليس لديك صلاحية الوصول." },
      { status: user?.role === "DEPUTY" ? 403 : 401, headers: { "Cache-Control": "no-store" } }
    )
  };

}


// Roles that may sign in, and where each one starts. A teacher (مرشدة)
// only takes attendance for the sections assigned to her; a معاون sees
// the whole site but users, backups and starting a year, and of المالية
// (and الكادر, which holds salaries) only what is given to them
// (lib/finance-access.js).

export const ROLE_HOME = {
  ADMIN: "/dashboard",
  TEACHER: "/dashboard/attendance",
  DEPUTY: "/dashboard"
};

export function canSignIn(role) {
  return role in ROLE_HOME;
}

// For server pages: the signed-in user if their role is allowed here;
// otherwise a redirect to /login, or to their own start page.

export async function requirePageUser(roles = ["ADMIN"]) {

  const user = await getCurrentUser();

  if (!user || !canSignIn(user.role)) {
    redirect("/login");
  }

  if (!roles.includes(user.role)) {
    redirect(ROLE_HOME[user.role]);
  }

  return user;

}
