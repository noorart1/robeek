import prisma from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { errorResponse, readBody } from "../../../../lib/users";
import { fullName } from "../../../../lib/labels";
import { activeAcademicYear } from "../../../../lib/student-data";
import { defaultEnrollmentDate } from "../../../../lib/enrollment-fields";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// نقل من السنة السابقة: after «بدء السنة الدراسية» the year is empty; this
// brings chosen people from the year before it into it, money excluded.
//   GET  → what can be brought: { from, to, students, staff, lines }
//   POST { studentIds, staffIds, lineIds, teachers }
// A child is enrolled in the section of the same shift and letter, with
// its attendance type, a fee of 0 and no payment plan (set them in the
// dialog), and becomes ACTIVE; staff and lines are reactivated; with
// `teachers`, every new section without a teacher gets last year's.
// Admins only.

async function years() {
  const to = await activeAcademicYear();
  const from = to && await prisma.academicYear.findFirst({
    where: { kind: "REGULAR", id: { lt: to.id } },
    orderBy: { id: "desc" }
  });
  return { from, to };
}

const sectionKey = (cls) => `${cls.shift}-${cls.name}`;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") return errorResponse("ليس لديك صلاحية الوصول.", 401);

    const { from, to } = await years();
    if (!from) return Response.json({ from: null }, { headers: { "Cache-Control": "no-store" } });

    const [enrollments, staff, lines] = await Promise.all([
      prisma.enrollment.findMany({
        where: { academicYearId: from.id },
        select: {
          status: true,
          Class: { select: { name: true, shift: true } },
          Student: {
            select: {
              id: true, firstName: true, fatherName: true, grandfatherName: true, lastName: true,
              Enrollment: { where: { academicYearId: to.id }, select: { id: true } }
            }
          }
        }
      }),
      prisma.staff.findMany({ select: { id: true, name: true, job: true, isActive: true }, orderBy: { id: "asc" } }),
      prisma.transportLine.findMany({ select: { id: true, name: true, shift: true, isActive: true }, orderBy: { id: "asc" } })
    ]);

    const students = enrollments
      .map((e) => ({
        id: e.Student.id,
        name: fullName(e.Student),
        shift: e.Class.shift,
        section: e.Class.name,
        // Left during that year: offered, not ticked.
        left: e.status !== "ACTIVE",
        // Already in the new year.
        done: e.Student.Enrollment.length > 0
      }))
      .sort((a, b) => b.shift.localeCompare(a.shift) || a.section.localeCompare(b.section) || a.name.localeCompare(b.name));

    return Response.json(
      { from: from.name, to: to.name, students, staff, lines },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Carry-over GET error:", error);
    return errorResponse("حدث خطأ أثناء تحميل السنة السابقة.", 500);
  }
}

const ids = (value) => (Array.isArray(value) ? value.filter((id) => Number.isSafeInteger(id) && id > 0) : []);

export async function POST(request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") return errorResponse("ليس لديك صلاحية الوصول.", 401);

    const body = await readBody(request);
    if (!body || typeof body !== "object") return errorResponse("البيانات المرسلة غير صالحة.", 400);

    const { from, to } = await years();
    if (!from) return errorResponse("لا توجد سنة سابقة.", 400);

    const studentIds = ids(body.studentIds);
    const staffIds = ids(body.staffIds);
    const lineIds = ids(body.lineIds);

    const result = await prisma.$transaction(async (tx) => {
      const [oldClasses, newClasses] = await Promise.all([
        tx.class.findMany({ where: { academicYearId: from.id } }),
        tx.class.findMany({ where: { academicYearId: to.id } })
      ]);
      const newByKey = new Map(newClasses.map((cls) => [sectionKey(cls), cls]));
      const oldById = new Map(oldClasses.map((cls) => [cls.id, cls]));

      // Only children of that year not yet in this one.
      const enrollments = await tx.enrollment.findMany({
        where: {
          academicYearId: from.id,
          studentId: { in: studentIds },
          Student: { Enrollment: { none: { academicYearId: to.id } } }
        }
      });

      let students = 0;
      const missing = new Set();
      const now = new Date();

      for (const e of enrollments) {
        const old = oldById.get(e.classId);
        const cls = newByKey.get(sectionKey(old));
        if (!cls) {
          missing.add(`${old.shift === "EVENING" ? "مسائي" : "صباحي"} ${old.name}`);
          continue;
        }

        await tx.enrollment.create({
          data: {
            studentId: e.studentId,
            classId: cls.id,
            academicYearId: to.id,
            enrollmentDate: defaultEnrollmentDate(to.name, cls.shift),
            attendanceType: e.attendanceType,
            tuitionFee: 0,
            paymentPlan: null
          }
        });
        await tx.student.update({ where: { id: e.studentId }, data: { status: "ACTIVE", updatedAt: now } });
        students += 1;
      }

      const staff = staffIds.length
        ? (await tx.staff.updateMany({ where: { id: { in: staffIds } }, data: { isActive: true, updatedAt: now } })).count
        : 0;
      const lines = lineIds.length
        ? (await tx.transportLine.updateMany({ where: { id: { in: lineIds } }, data: { isActive: true } })).count
        : 0;

      let teachers = 0;
      if (body.teachers === true) {
        for (const old of oldClasses) {
          const cls = newByKey.get(sectionKey(old));
          if (!cls || cls.teacherName || cls.staffId || !(old.teacherName || old.staffId)) continue;
          await tx.class.update({
            where: { id: cls.id },
            data: { teacherName: old.teacherName, staffId: old.staffId, teacherUserId: old.teacherUserId }
          });
          teachers += 1;
        }
      }

      return { students, staff, lines, teachers, missing: [...missing] };
    }, { timeout: 60000 });

    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Carry-over POST error:", error);
    return errorResponse("حدث خطأ أثناء النقل من السنة السابقة.", 500);
  }
}
