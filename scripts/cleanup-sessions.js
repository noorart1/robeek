// Drop sessions that expired without a logout. Nothing else removes them
// (getCurrentUser deletes one only when its cookie comes back).
//
//   node scripts/cleanup-sessions.js
//
// cPanel cron, once a night, beside the backup (server time, see
// scripts/backup.js):
//   45 1 * * *  cd ~/school-app && ~/nodevenv/school-app/24/bin/node scripts/cleanup-sessions.js >> ~/backups/school-app/backup.log 2>&1

require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

prisma.session
  .deleteMany({ where: { expiresAt: { lte: new Date() } } })
  .then(({ count }) => console.log(`${new Date().toISOString()}  sessions: ${count} expired removed`))
  .catch((error) => {
    console.error(`${new Date().toISOString()}  SESSION CLEANUP FAILED: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
