// Nightly backup: the database (gzipped SQL dump) and the student photos
// (tar.gz), kept for BACKUP_KEEP_DAYS days. The work is in lib/backup.js,
// shared with the backups page (/dashboard/backups); settings are
// documented there.
//
//   node scripts/backup.js
//
// cPanel cron (Advanced → Cron Jobs), once a night. Cron uses the server's
// own time zone (check with `date`), not Iraq's; any hour when nobody is
// entering data will do:
//   30 1 * * *  cd ~/school-app && ~/nodevenv/school-app/24/bin/node scripts/backup.js >> ~/backups/school-app/backup.log 2>&1

require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { BACKUP_DIR, KEEP_DAYS, backupNow } = require("../lib/backup");

function log(message) {
  console.log(`${new Date().toISOString()}  ${message}`);
}

function describe(name) {
  const file = path.join(BACKUP_DIR, name);
  return `${file} (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`;
}

backupNow()
  .then(({ db, photos, removed }) => {
    log(`database → ${describe(db)}`);
    log(photos ? `photos   → ${describe(photos)}` : "no photo directory, skipped");
    if (removed) log(`removed ${removed} backups older than ${KEEP_DAYS} days`);
  })
  .catch((error) => {
    log(`BACKUP FAILED: ${error.message}`);
    process.exitCode = 1;
  });
