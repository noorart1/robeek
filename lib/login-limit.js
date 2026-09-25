
import { createHash } from "node:crypto";
import prisma from "./prisma";

const LOCK_DURATION = 15 * 60 * 1000;
const STALE_AFTER = 24 * 60 * 60 * 1000;

// Failures are counted per username *and* client IP, so someone who only
// knows the admin's username cannot lock the admin out from elsewhere.
const USER_MAX_ATTEMPTS = 5;

// A looser per-IP limit stops one address trying many usernames.
const IP_MAX_ATTEMPTS = 20;

function hashKey(text) {
  return createHash("sha256").update(text).digest("hex");
}

// Passenger/Apache append the real client address as the last
// X-Forwarded-For entry; earlier entries are client-supplied.
export function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    const last = forwarded.split(",").pop().trim();
    if (last) return last;
  }

  return request.headers.get("x-real-ip")?.trim() || null;
}

export function getLoginKeys(username, ip) {
  const user = username.trim().toLowerCase();

  const keys = [
    {
      key: hashKey(`user:${user}|ip:${ip || "unknown"}`),
      max: USER_MAX_ATTEMPTS
    }
  ];

  // Without a known IP every client would share one counter, letting
  // anyone lock out everyone, so the per-IP limit is skipped.
  if (ip) {
    keys.push({
      key: hashKey(`ip:${ip}`),
      max: IP_MAX_ATTEMPTS
    });
  }

  return keys;
}

export async function checkLoginLimit(keys) {
  const records = await prisma.loginAttempt.findMany({
    where: { ipHash: { in: keys.map(({ key }) => key) } }
  });

  const now = new Date();

  return !records.some(
    (record) => record.lockedUntil && record.lockedUntil > now
  );
}

export async function recordFailedLogin(keys) {
  const now = new Date();

  for (const { key, max } of keys) {
    const record = await prisma.loginAttempt.upsert({
      where: { ipHash: key },
      create: {
        ipHash: key,
        attempts: 1,
        updatedAt: now
      },
      update: {
        attempts: {
          increment: 1
        },
        updatedAt: now
      }
    });

    if (record.attempts >= max) {
      await prisma.loginAttempt.update({
        where: { ipHash: key },
        data: {
          lockedUntil: new Date(
            now.getTime() + LOCK_DURATION
          ),
          attempts: 0,
          updatedAt: now
        }
      });
    }
  }
}

// Only the username+IP counter is cleared: a successful login must not
// reset the per-IP counter that guards against username spraying.
// Rows untouched for a day and not currently locked are dropped too, so
// the table does not grow with every mistyped username.
export async function resetLoginLimit(keys) {
  const now = new Date();

  await prisma.loginAttempt.deleteMany({
    where: {
      OR: [
        { ipHash: keys[0].key },
        {
          updatedAt: { lt: new Date(now.getTime() - STALE_AFTER) },
          OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }]
        }
      ]
    }
  });
}
