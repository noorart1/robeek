// Backups of the database (gzipped SQL dump) and the student photos
// (tar.gz): made nightly by scripts/backup.js and on demand from
// /dashboard/backups, which can also download, upload and restore them.
//
// CommonJS, not ESM like the rest of lib/, because scripts/backup.js
// loads it with plain `node`.
//
// Settings (environment, all optional):
//   BACKUP_DIR        where to write; default ~/backups/school-app — keep it
//                     OUTSIDE the app and public_html, the files hold
//                     children's personal data
//   BACKUP_KEEP_DAYS  default 30
//   MYSQLDUMP, MYSQL  client paths; default "mysqldump", "mysql"
//   PHOTO_DIR         default ./uploads/students (as in lib/photos.js)
//
// The database password is read from DATABASE_URL (.env) and handed to
// the MySQL clients through a temporary 0600 options file, never on the
// command line, where other users of a shared host could see it in `ps`.

const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { spawn } = require("child_process");
const { pipeline } = require("stream/promises");

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(os.homedir(), "backups", "school-app");
const KEEP_DAYS = Number(process.env.BACKUP_KEEP_DAYS || 30);
const MYSQLDUMP = process.env.MYSQLDUMP || "mysqldump";
const MYSQL = process.env.MYSQL || "mysql";
const PHOTO_DIR = process.env.PHOTO_DIR || path.join(process.cwd(), "uploads", "students");

// db-2026-09-25_2330.sql.gz (nightly, older) or
// db-2026-09-26_151200-upload.sql.gz (to the second, with an optional tag).
const NAME_PATTERN = /^(db|photos)-\d{4}-\d{2}-\d{2}_\d{4}(\d{2})?(-[a-z][a-z0-9-]*)?\.(sql|tar)\.gz$/;

// Same as lib/photos.js; a photo archive may hold nothing else.
const PHOTO_ENTRY = /^students\/(\d+-[0-9a-f]{16}\.jpg)?$/;

function isBackupName(name) {
  const match = NAME_PATTERN.exec(name || "");
  return Boolean(match) && (match[1] === "db") === (match[4] === "sql");
}

function backupPath(name) {
  if (!isBackupName(name)) throw new Error(`not a backup file name: ${name}`);
  return path.join(BACKUP_DIR, name);
}

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

function newName(kind, tag) {
  // 2026-09-26_151200 in UTC; seconds, so a safety backup taken just
  // before a restore cannot collide with one made the same minute.
  // A second file in the same second gets "-2", "-3"… instead of
  // replacing the first.
  const when = new Date().toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "");
  const base = `${kind}-${when}${tag ? `-${tag}` : ""}`;
  const extension = kind === "db" ? ".sql.gz" : ".tar.gz";

  for (let n = 1; ; n += 1) {
    const name = base + (n > 1 ? `-${n}` : "") + extension;
    if (!fs.existsSync(path.join(BACKUP_DIR, name))) return name;
  }
}

// Option-file values are quoted, with \ and " escaped.
const quote = (value) => `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

// Runs a MySQL client with the credentials in an options file and resolves
// once it exits 0; `wire` connects its stdin/stdout.
async function runClient(program, args, stdio, wire) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });

  const db = databaseConfig();
  const optionsFile = path.join(BACKUP_DIR, `.client-${process.pid}-${Date.now()}.cnf`);

  fs.writeFileSync(
    optionsFile,
    `[client]\nuser=${quote(db.user)}\npassword=${quote(db.password)}\nhost=${quote(db.host)}\nport=${db.port}\n`,
    { mode: 0o600 }
  );

  try {
    // --defaults-extra-file must be the first option.
    const child = spawn(program, [`--defaults-extra-file=${optionsFile}`, ...args, db.database], { stdio });

    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });

    const exited = new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`${program} exited with ${code}: ${stderr.trim()}`))
      );
    });

    // The client's own error first: when it dies, the pipe into it fails
    // with a bare EPIPE that says nothing.
    const [piped, done] = await Promise.allSettled([wire(child), exited]);
    if (done.status === "rejected") throw done.reason;
    if (piped.status === "rejected") throw piped.reason;
  } finally {
    fs.rmSync(optionsFile, { force: true });
  }
}

async function dumpDatabase(tag) {
  const name = newName("db", tag);
  const target = path.join(BACKUP_DIR, name);
  const partial = target + ".partial";

  try {
    await runClient(
      MYSQLDUMP,
      ["--single-transaction", "--quick", "--routines", "--triggers", "--default-character-set=utf8mb4"],
      ["ignore", "pipe", "pipe"],
      (child) => pipeline(child.stdout, zlib.createGzip({ level: 9 }), fs.createWriteStream(partial, { mode: 0o600 }))
    );

    // Only a complete dump gets the real name, so a failure never leaves
    // a truncated file that looks like a good backup.
    fs.renameSync(partial, target);
  } finally {
    fs.rmSync(partial, { force: true });
  }

  return name;
}

function runTar(args, cwd) {
  return new Promise((resolve, reject) => {
    const tar = spawn("tar", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    tar.stdout.on("data", (chunk) => { stdout += chunk; });
    tar.stderr.on("data", (chunk) => { stderr += chunk; });
    tar.on("error", reject);
    tar.on("close", (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(`tar failed: ${stderr.trim()}`))
    );
  });
}

// Returns the file name, or null when there is no photo directory yet.
async function archivePhotos(tag) {
  if (!fs.existsSync(PHOTO_DIR)) return null;

  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });

  const name = newName("photos", tag);

  // Run inside the backup directory and pass a bare file name: GNU tar
  // reads "C:\..." in -f as a remote host, so no drive letter may reach it.
  try {
    await runTar(["-czf", name, "-C", path.dirname(PHOTO_DIR), path.basename(PHOTO_DIR)], BACKUP_DIR);
  } catch (error) {
    fs.rmSync(path.join(BACKUP_DIR, name), { force: true });
    throw error;
  }

  fs.chmodSync(path.join(BACKUP_DIR, name), 0o600);
  return name;
}

function pruneOld() {
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  let removed = 0;

  for (const name of fs.readdirSync(BACKUP_DIR)) {
    if (!isBackupName(name)) continue;

    const file = path.join(BACKUP_DIR, name);
    if (fs.statSync(file).mtimeMs < cutoff) {
      fs.rmSync(file);
      removed += 1;
    }
  }

  return removed;
}

// ponytail: one backup or restore at a time per process; Passenger runs
// this app as a single process, a DB-level lock if that ever changes.
let busy = false;

async function exclusive(task) {
  if (busy) throw Object.assign(new Error("another backup or restore is running"), { code: "BUSY" });
  busy = true;
  try {
    return await task();
  } finally {
    busy = false;
  }
}

function backupNow(tag) {
  return exclusive(async () => {
    const db = await dumpDatabase(tag);
    const photos = await archivePhotos(tag);
    return { db, photos, removed: pruneOld() };
  });
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  return fs.readdirSync(BACKUP_DIR)
    .filter(isBackupName)
    .map((name) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, name));
      return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// First bytes of the SQL inside a .gz, or null if it is not gzip.
async function sqlHead(file) {
  const chunks = [];
  let length = 0;
  const input = fs.createReadStream(file);

  try {
    for await (const chunk of input.pipe(zlib.createGunzip())) {
      chunks.push(chunk);
      length += chunk.length;
      if (length >= 1024) break;
    }
  } catch {
    return null;
  } finally {
    input.destroy();
  }

  return Buffer.concat(chunks).toString("utf8", 0, 1024);
}

function isDump(head) {
  return /^-- (MySQL|MariaDB) dump/m.test(head || "");
}

// Every entry must be the students/ directory or a photo in it, and a
// plain file or directory: no "..", no absolute paths, no links that a
// later entry could write through.
async function checkPhotoArchive(file) {
  const listing = await runTar(["-tvzf", path.basename(file)], path.dirname(file));

  const lines = listing.split("\n").filter(Boolean);

  if (!lines.length) throw Object.assign(new Error("empty photo archive"), { code: "BAD_FILE" });

  for (const line of lines) {
    const type = line[0];
    const entry = line.split(/\s+/).slice(5).join(" ");
    if ((type !== "-" && type !== "d") || !PHOTO_ENTRY.test(entry)) {
      throw Object.assign(new Error(`unexpected entry in photo archive: ${entry}`), { code: "BAD_FILE" });
    }
  }
}

// Stores an uploaded file under a name chosen here from its content, never
// the uploader's file name. `stream` is a Node Readable.
async function saveUpload(stream, maxBytes) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });

  const partial = path.join(BACKUP_DIR, `.upload-${process.pid}-${Date.now()}.partial`);
  let size = 0;

  try {
    await pipeline(
      stream,
      async function* (source) {
        for await (const chunk of source) {
          size += chunk.length;
          if (size > maxBytes) throw Object.assign(new Error("upload too large"), { code: "TOO_LARGE" });
          yield chunk;
        }
      },
      fs.createWriteStream(partial, { mode: 0o600 })
    );

    let kind = null;

    if (isDump(await sqlHead(partial))) {
      kind = "db";
    } else {
      try {
        await checkPhotoArchive(partial);
        kind = "photos";
      } catch (error) {
        if (error.code === "BAD_FILE") throw error;
      }
    }

    if (!kind) throw Object.assign(new Error("not a backup file"), { code: "BAD_FILE" });

    const name = newName(kind, "upload");
    fs.renameSync(partial, path.join(BACKUP_DIR, name));
    return name;
  } finally {
    fs.rmSync(partial, { force: true });
  }
}

// Replaces the current database (or adds the archived photos) with a
// backup, after taking a safety backup of the current state. Returns the
// safety backup's name.
function restore(name) {
  const file = backupPath(name);

  return exclusive(async () => {
    if (!fs.existsSync(file)) throw Object.assign(new Error("no such backup"), { code: "NOT_FOUND" });

    if (name.startsWith("db-")) {
      if (!isDump(await sqlHead(file))) throw Object.assign(new Error("not a SQL dump"), { code: "BAD_FILE" });

      const safety = await dumpDatabase("pre-restore");

      // --sandbox: a dump must not run client commands such as \! (shell)
      // or source; mysqldump files never contain them.
      await runClient(
        MYSQL,
        ["--sandbox", "--default-character-set=utf8mb4"],
        ["pipe", "ignore", "pipe"],
        (child) => pipeline(fs.createReadStream(file), zlib.createGunzip(), child.stdin)
      );

      return safety;
    }

    await checkPhotoArchive(file);

    const safety = await archivePhotos("pre-restore");

    // Adds and overwrites photos; photos added since the backup stay.
    fs.mkdirSync(PHOTO_DIR, { recursive: true });
    await runTar(
      ["-xzf", path.basename(file), "--no-same-owner", "--no-same-permissions", "-C", path.dirname(PHOTO_DIR)],
      BACKUP_DIR
    );

    return safety;
  });
}

module.exports = {
  BACKUP_DIR,
  KEEP_DAYS,
  backupNow,
  backupPath,
  isBackupName,
  listBackups,
  restore,
  saveUpload
};
