
import prisma from "../../../lib/prisma";
import { getCurrentUser } from "../../../lib/auth";
import { errorResponse, readBody } from "../../../lib/users";
import { summerYearName, upcomingSummerName } from "../../../lib/labels";
import { activeAcademicYear } from "../../../lib/student-data";
import { nextYearName } from "../../../lib/finance";
import { backupNow } from "../../../lib/backup";
import { iraqToday } from "../../../lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// بدء سنة دراسية جديدة: "2025-2026" → "2026-2027". Admins only.
// The year starts empty: the active year's sections are copied without
// their teachers, nobody is enrolled, every child becomes INACTIVE until
// registered for it (PUT /api/students/[id]/enrollment, from the earlier
// year's tab), and every staff member and transport line INACTIVE until
// reactivated (a line keeps its riders). Earlier years, with their payments, debts, salaries and
// expenses, stay as they are and are browsed from the dashboard and the
// finance page. A backup is taken first.
//
// POST { kind: "SUMMER" } starts الدورة الصيفية instead (startSummer).

export async function POST(request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") return errorResponse("ليس لديك صلاحية الوصول.", 401);

    if ((await readBody(request))?.kind === "SUMMER") return await startSummer();

    const current = await activeAcademicYear();
    const name = nextYearName(current?.name);
    if (!name) return errorResponse("لا توجد سنة دراسية نشطة بصيغة مثل 2025-2026.", 400);

    // Not before July of its first year: a second click must not start
    // the year after next.
    if (iraqToday() < `${name.slice(0, 4)}-07-01`) {
      return errorResponse(`لا يمكن بدء السنة ${name} قبل 1 تموز ${name.slice(0, 4)}.`, 400);
    }

    if (await prisma.academicYear.findUnique({ where: { name } })) {
      return errorResponse(`السنة الدراسية ${name} موجودة مسبقاً.`, 409);
    }

    await backupNow("pre-new-year");

    const result = await prisma.$transaction(async (tx) => {
      const year = await tx.academicYear.create({ data: { name, isActive: false } });

      const classes = await tx.class.findMany({ where: { academicYearId: current.id } });
      await tx.class.createMany({
        data: classes.map(({ name, grade, shift, capacity }) => ({ name, grade, shift, capacity, academicYearId: year.id }))
      });

      await tx.student.updateMany({ where: { status: "ACTIVE" }, data: { status: "INACTIVE", updatedAt: new Date() } });
      await tx.staff.updateMany({ where: { isActive: true }, data: { isActive: false, updatedAt: new Date() } });
      await tx.transportLine.updateMany({ data: { isActive: false } });

      await tx.academicYear.update({ where: { id: current.id }, data: { isActive: false } });
      await tx.academicYear.update({ where: { id: year.id }, data: { isActive: true } });

      return { name, classes: classes.length };
    });

    return Response.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error.code === "BUSY") return errorResponse("نسخة احتياطية أخرى قيد التنفيذ، حاول بعد قليل.", 409);
    console.error("Academic year POST error:", error);
    return errorResponse("حدث خطأ أثناء بدء السنة الدراسية الجديدة.", 500);
  }
}

// بدء الدورة الصيفية «صيف 2026» (May–August), any time: until August
// this year's, from September next year's (upcomingSummerName), so
// registration can open early. Copies the school year's sections with their teachers (evening ones too,
// for when the summer has an evening shift) and becomes the active summer
// course beside the school year. Nobody is enrolled automatically: each
// child is registered for the summer with its own fee. The previous
// summer course ends; what is still owed on it stays in «المتأخرون».
async function startSummer() {
  const name = upcomingSummerName(iraqToday());

  if (await prisma.academicYear.findUnique({ where: { name } })) {
    return errorResponse(`الدورة ${name} موجودة مسبقاً.`, 409);
  }

  const current = await activeAcademicYear();
  if (!current) return errorResponse("لا توجد سنة دراسية نشطة لنسخ شعبها.", 400);
  // The summer belongs to the school year it ends (2026-2027 → «صيف 2027»).
  if (name !== summerYearName(current.name.slice(5))) {
    return errorResponse(`ابدأ السنة الدراسية ${nextYearName(current.name)} أولاً.`, 400);
  }

  await backupNow("pre-summer");

  const result = await prisma.$transaction(async (tx) => {
    await tx.academicYear.updateMany({ where: { kind: "SUMMER", isActive: true }, data: { isActive: false } });
    const year = await tx.academicYear.create({ data: { name, kind: "SUMMER", isActive: true } });

    const classes = await tx.class.findMany({ where: { academicYearId: current.id } });
    await tx.class.createMany({
      data: classes.map(({ id, academicYearId, ...fields }) => ({ ...fields, academicYearId: year.id }))
    });

    return { name, classes: classes.length };
  });

  return Response.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
}
