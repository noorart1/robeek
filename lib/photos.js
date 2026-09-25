
import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

// Student photos live on disk outside public/, so they are only reachable
// through the authenticated /api/students/[id]/photo route. The database
// `photo` column stores just the file name.
//
// The directory must survive deploys and be included in backups: it is
// gitignored, and neither `git pull` nor `next build` touches it.

const PHOTO_DIR =
  process.env.PHOTO_DIR ||
  path.join(process.cwd(), "uploads", "students");

// Browsers resize and re-encode to JPEG before upload; this is a ceiling.
export const MAX_PHOTO_BYTES = 1024 * 1024;

const NAME_PATTERN = /^\d+-[0-9a-f]{16}\.jpg$/;

export function isJpeg(buffer) {
  return (
    buffer.length > 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

export async function savePhoto(studentId, buffer) {
  await mkdir(PHOTO_DIR, { recursive: true });

  const name = `${studentId}-${randomBytes(8).toString("hex")}.jpg`;

  await writeFile(path.join(PHOTO_DIR, name), buffer);

  return name;
}

// Only names this module generated are ever turned into paths.
function photoPath(name) {
  return typeof name === "string" && NAME_PATTERN.test(name)
    ? path.join(PHOTO_DIR, name)
    : null;
}

export async function readPhoto(name) {
  const file = photoPath(name);

  if (!file) return null;

  try {
    return await readFile(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function deletePhoto(name) {
  const file = photoPath(name);

  if (!file) return;

  try {
    await unlink(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
