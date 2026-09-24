
import { createHash } from "node:crypto";
import prisma from "./prisma";

const MAX_ATTEMPTS = 5;
const LOCK_DURATION = 15 * 60 * 1000;

export function getLoginKey(username) {
  return createHash("sha256")
    .update(username.trim().toLowerCase())
    .digest("hex");
}

export async function checkLoginLimit(key) {
  const record = await prisma.loginAttempt.findUnique({
    where: { ipHash: key }
  });

  if (!record) return true;

  if (
    record.lockedUntil &&
    record.lockedUntil > new Date()
  ) {
    return false;
  }

  return true;
}

export async function recordFailedLogin(key) {
  const now = new Date();

  const record = await prisma.loginAttempt.upsert({
    where: { ipHash: key },
    create: {
      ipHash: key,
      attempts: 1
    },
    update: {
      attempts: {
        increment: 1
      }
    }
  });

  if (record.attempts >= MAX_ATTEMPTS) {
    await prisma.loginAttempt.update({
      where: { ipHash: key },
      data: {
        lockedUntil: new Date(
          now.getTime() + LOCK_DURATION
        ),
        attempts: 0
      }
    });
  }
}

export async function resetLoginLimit(key) {
  await prisma.loginAttempt.deleteMany({
    where: { ipHash: key }
  });
}