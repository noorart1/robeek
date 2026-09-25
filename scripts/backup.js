
// Nightly backup: the database (gzipped SQL dump) and the student photos
// (tar.gz), kept for BACKUP_KEEP_DAYS days.
//
//   node scripts/backup.js
//
// cPanel cron (Advanced → Cron Jobs), once a night. Cron uses the server's
// own time zone (check with `date`), not Iraq's; any hour when nobody is
// entering data will do:
//   30 1 * * *  cd ~/school-app && ~/nodevenv/school-app/24/bin/node scripts/backup.js >> ~/backups/school-app/backup.log 2>&1
//
// Settings (environment, all optional):
//   BACKUP_DIR        where to write; default ~/backups/school-app — keep it
//                     OUTSIDE the app and public_html, the files hold
//                     children's personal data
//   BACKUP_KEEP_DAYS  default 30
//   MYSQLDUMP         path to mysqldump / mariadb-dump; default "mysqldump"
//   PHOTO_DIR         default ./uploads/students (as in lib/photos.js)
//
// The database password is read from DATABASE_URL (.env) and handed to
// mysqldump through a temporary 0600 options file, never on the command
// line, where other users of a shared host could see it in `ps`.

require("dotenv").config();

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { spawn, spawnSync } = require("child_process");
const { pipeline } = require("stream/promises");

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(os.homedir(), "backups", "school-app");
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS || 30);
const MYSQLDUMP = process.env.MYSQLDUMP || "mysqldump";
const PHOTO_DIR = process.env.PHOTO_DIR || path.join(process.cwd(), "uploads", "students");

// mysql://user:password@host:port/database. Parsed by hand rather than with
// `new URL()`, which mis-splits passwords containing "@", "\" or quotes
// (the production password contains "@"): the host is whatever follows
// the LAST "@", and the user ends at the first ":".
function databaseConfig() {
  const raw = (process.env.DATABASE_URL || "").trim().replace(/^"|"$/g, "");
  const match = /^mysql:\/\/(.*)@([^@/]+)\/([^?#]+)/.exec(raw);

  if (!match) {
    throw new Error("DATABASE_URL is not a mysql://user:password@host/database URL");
  }

  const [, userinfo, hostPort, database] = match;
  const colon = userinfo.indexOf(":");
  const [host, port] = hostPort.split(":");

  // Percent-escapes are decoded; a lone "%" that is not an escape is kept.
  const decode = (text) => {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  };

  return {
    user: decode(colon === -1 ? userinfo : userinfo.slice(0, colon)),
    password: colon === -1 ? "" : decode(userinfo.slice(colon + 1)),
    host: host || "localhost",
    port: port || "3306",
    database: decode(database)
  };
}

function stamp(date = new Date()) {
  // 2026-09-25_2330 in UTC; the log line carries the full timestamp.
  return date.toISOString().slice(0, 16).replace("T", "_").replace(":", "");
}

function log(message) {
  console.log(`${new Date().toISOString()}  ${message}`);
}

// Option-file values are quoted, with \ and " escaped.
const quote = (value) => `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

async function dumpDatabase(target) {
  const db = databaseConfig();
  const optionsFile = path.join(BACKUP_DIR, `.dump-${process.pid}.cnf`);

  fs.writeFileSync(
    optionsFile,
    `[client]\nuser=${quote(db.user)}\npassword=${quote(db.password)}\nhost=${quote(db.host)}\nport=${db.port}\n`,
    { mode: 0o600 }
  );

  const partial = target + ".partial";

  try {
    const dump = spawn(
      MYSQLDUMP,
      [
        // Must be the first option.
        `--defaults-extra-file=${optionsFile}`,
        "--single-transaction",
        "--quick",
        "--routines",
        "--triggers",
        "--default-character-set=utf8mb4",
        db.database
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let stderr = "";
    dump.stderr.on("data", (chunk) => { stderr += chunk; });

    const exited = new Promise((resolve, reject) => {
      dump.on("error", reject);
      dump.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`mysqldump exited with ${code}: ${stderr.trim()}`))
      );
    });

    await Promise.all([
      pipeline(dump.stdout, zlib.createGzip({ level: 9 }), fs.createWriteStream(partial, { mode: 0o600 })),
      exited
    ]);

    // Only a complete dump gets the real name, so a failed night never
    // leaves a truncated file that looks like a good backup.
    fs.renameSync(partial, target);
  } finally {
    fs.rmSync(optionsFile, { force: true });
    fs.rmSync(partial, { force: true });
  }
}

function archivePhotos(target) {
  if (!fs.existsSync(PHOTO_DIR)) {
    log(`no photo directory at ${PHOTO_DIR}, skipped`);
    return false;
  }

  // Run inside the backup directory and pass a bare file name: GNU tar
  // reads "C:\..." in -f as a remote host, so no drive letter may reach it.
  const result = spawnSync(
    "tar",
    ["-czf", path.basename(target), "-C", path.dirname(PHOTO_DIR), path.basename(PHOTO_DIR)],
    { encoding: "utf8", cwd: path.dirname(target) }
  );

  if (result.status !== 0) {
    fs.rmSync(target, { force: true });
    throw new Error(`tar failed: ${(result.stderr || result.error?.message || "").trim()}`);
  }

  fs.chmodSync(target, 0o600);
  return true;
}

function pruneOld() {
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  let removed = 0;

  for (const name of fs.readdirSync(BACKUP_DIR)) {
    if (!/^(db|photos)-\d{4}-\d{2}-\d{2}_\d{4}\.(sql\.gz|tar\.gz)$/.test(name)) continue;

    const file = path.join(BACKUP_DIR, name);
    if (fs.statSync(file).mtimeMs < cutoff) {
      fs.rmSync(file);
      removed += 1;
    }
  }

  return removed;
}

async function main() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });

  const when = stamp();
  const dbFile = path.join(BACKUP_DIR, `db-${when}.sql.gz`);
  const photoFile = path.join(BACKUP_DIR, `photos-${when}.tar.gz`);

  await dumpDatabase(dbFile);
  log(`database → ${dbFile} (${(fs.statSync(dbFile).size / 1024).toFixed(0)} KB)`);

  if (archivePhotos(photoFile)) {
    log(`photos   → ${photoFile} (${(fs.statSync(photoFile).size / 1024).toFixed(0)} KB)`);
  }

  const removed = pruneOld();
  if (removed) log(`removed ${removed} backups older than ${KEEP_DAYS} days`);
}

main().catch((error) => {
  log(`BACKUP FAILED: ${error.message}`);
  process.exitCode = 1;
});
