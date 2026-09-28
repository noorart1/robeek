
import prisma from "../../../lib/prisma";
import { getCurrentUser } from "../../../lib/auth";
import { errorResponse } from "../../../lib/users";
import { activeAcademicYear } from "../../../lib/student-data";
import { nextYearName } from "../../../lib/finance";
import { backupNow } from "../../../lib/backup";
import { iraqToday } from "../../../lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// بدء سنة دراسية جديدة: "2025-2026" → "2026-2027". Admins only.
// Copies the active year's sections (with their teachers) and moves every
// active child into the same section with the same fee, plan and type,
// starting on the first school day (morning 1 October, evening
// 1 November — lib/dues.js). Last year's enrollments, payments and debts
// stay as they are. A backup is taken first.

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") return errorResponse("ليس لديك صلاحية الوصول.", 401);

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

    const startYear = name.slice(0, 4);
    const result = await prisma.$transaction(async (tx) => {
      const year = await tx.academicYear.create({ data: { name, isActive: false } });

      const classMap = new Map();
      for (const cls of await tx.class.findMany({ where: { academicYearId: current.id } })) {
        const { id, academicYearId, ...fields } = cls;
        classMap.set(id, (await tx.class.create({ data: { ...fields, academicYearId: year.id } })).id);
      }

      const enrollments = await tx.enrollment.findMany({
        where: { academicYearId: current.id, Student: { status: "ACTIVE" } },
        include: { Class: { select: { shift: true } } }
      });

      await tx.enrollment.createMany({
        data: enrollments.map((e) => ({
          studentId: e.studentId,
          classId: classMap.get(e.classId),
          academicYearId: year.id,
          enrollmentDate: new Date(`${startYear}-${e.Class.shift === "EVENING" ? "11" : "10"}-01T00:00:00.000Z`),
          status: "ACTIVE",
          tuitionFee: e.tuitionFee,
          attendanceType: e.attendanceType,
          paymentPlan: e.paymentPlan
        }))
      });

      await tx.academicYear.update({ where: { id: current.id }, data: { isActive: false } });
      await tx.academicYear.update({ where: { id: year.id }, data: { isActive: true } });

      return { name, classes: classMap.size, students: enrollments.length };
    });

    return Response.json(result, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error.code === "BUSY") return errorResponse("نسخة احتياطية أخرى قيد التنفيذ، حاول بعد قليل.", 409);
    console.error("Academic year POST error:", error);
    return errorResponse("حدث خطأ أثناء بدء السنة الدراسية الجديدة.", 500);
  }
}
