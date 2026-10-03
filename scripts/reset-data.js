// Empty the running school year, keeping earlier years as history: what
// «بدء السنة الدراسية» does now, for a year started before it did
// (2026-2027 carried every child over).
//
//   node scripts/reset-data.js          # dry run: counts only
//   node scripts/reset-data.js --yes    # backup, then empty the year
//
// Deletes the active school year's enrollments, takes the teachers off its
// sections, and marks every child, staff member and line INACTIVE until
// registered or reactivated. Refuses while any of those enrollments has a
// payment. Earlier years, salaries and expenses stay.

require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { backupNow } = require("../lib/backup");

const prisma = new PrismaClient();

async function main() {
  const year = await prisma.academicYear.findFirst({ where: { kind: "REGULAR", isActive: true } });
  if (!year) throw new Error("no active school year");

  const where = { academicYearId: year.id };
  const enrollments = await prisma.enrollment.count({ where });
  const payments = await prisma.payment.count({ where: { Enrollment: where } });
  console.log(`${year.name}: ${enrollments} enrollments, ${payments} payments`);

  if (payments) throw new Error("the year already has payments; not touching it");

  if (!process.argv.includes("--yes")) {
    console.log("dry run: nothing changed. Add --yes to empty the year.");
    return;
  }

  const { db } = await backupNow("pre-reset");
  console.log(`backup → ${db}`);

  await prisma.$transaction([
    prisma.enrollment.deleteMany({ where }),
    prisma.class.updateMany({ where, data: { teacherName: null, teacherUserId: null, staffId: null } }),
    prisma.student.updateMany({ where: { status: "ACTIVE" }, data: { status: "INACTIVE", updatedAt: new Date() } }),
    prisma.staff.updateMany({ where: { isActive: true }, data: { isActive: false, updatedAt: new Date() } }),
    prisma.transportLine.updateMany({ data: { isActive: false } })
  ]);
  console.log("done");
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
