
import prisma from "../../../lib/prisma";
import { getCurrentUser } from "../../../lib/auth";
import { toWesternDigits } from "../../../lib/digits";
import {
  formatStudent,
  loadStudent,
  studentSelect
} from "../../../lib/student-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHIFT_LETTER = { MORNING: "M", EVENING: "E" };

// بررسی دسترسی مدیر

async function checkAdmin() {
  const user = await getCurrentUser();

  return Boolean(
    user &&
    user.role === "ADMIN"
  );
}

function jsonError(message, status) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

// دریافت فهرست کودکان

export async function GET() {
  try {

    if (!(await checkAdmin())) {
      return jsonError("ليس لديك صلاحية الوصول.", 401);
    }

    const students = await prisma.student.findMany({
      select: studentSelect,
      orderBy: { id: "asc" }
    });

    return Response.json(
      { students: students.map(formatStudent) },
      { headers: { "Cache-Control": "no-store" } }
    );

  } catch (error) {

    console.error("Students GET error:", error);

    return jsonError("حدث خطأ أثناء تحميل بيانات الأطفال.", 500);
  }
}

// Next free code for a section, following the imported pattern M-A-07;
// children without a section get S-001, S-002, ...
async function nextStudentCode(tx, cls) {
  const prefix = cls ? `${SHIFT_LETTER[cls.shift] || "X"}-${cls.name}-` : "S-";
  const width = cls ? 2 : 3;

  const taken = await tx.student.findMany({
    where: { studentCode: { startsWith: prefix } },
    select: { studentCode: true }
  });

  const highest = taken.reduce((max, { studentCode }) => {
    const number = Number(studentCode.slice(prefix.length));
    return Number.isInteger(number) && number > max ? number : max;
  }, 0);

  return prefix + String(highest + 1).padStart(width, "0");
}

function optionalText(value, limit) {
  if (value === undefined || value === null) return { value: null };
  if (typeof value !== "string" || value.length > limit) return { error: true };
  return { value: value.trim() || null };
}

// ثبت کودک جدید

export async function POST(request) {
  try {

    if (!(await checkAdmin())) {
      return jsonError("ليس لديك صلاحية الوصول.", 401);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return jsonError("البيانات المرسلة غير صالحة.", 400);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonError("البيانات المرسلة غير صالحة.", 400);
    }

    const code = optionalText(body.studentCode, 50);
    const firstName = optionalText(body.firstName, 100);
    const fatherName = optionalText(body.fatherName, 100);
    const grandfatherName = optionalText(body.grandfatherName, 100);
    const lastName = optionalText(body.lastName, 100);

    if (
      [code, firstName, fatherName, grandfatherName, lastName].some((f) => f.error) ||
      !firstName.value
    ) {
      return jsonError("يرجى إدخال اسم الطفل.", 400);
    }

    let classId = null;

    if (body.classId !== undefined && body.classId !== null && body.classId !== "") {
      classId = Number(body.classId);

      if (!Number.isSafeInteger(classId) || classId <= 0) {
        return jsonError("الشعبة المحددة غير صالحة.", 400);
      }
    }

    const id = await prisma.$transaction(async (tx) => {
      const cls = classId
        ? await tx.class.findUnique({ where: { id: classId } })
        : null;

      if (classId && !cls) {
        throw Object.assign(new Error("class"), { code: "NO_CLASS" });
      }

      const student = await tx.student.create({
        data: {
          studentCode: code.value
            ? toWesternDigits(code.value)
            : await nextStudentCode(tx, cls),
          firstName: firstName.value,
          fatherName: fatherName.value,
          grandfatherName: grandfatherName.value,
          lastName: lastName.value,
          updatedAt: new Date()
        },
        select: { id: true }
      });

      if (cls) {
        await tx.enrollment.create({
          data: {
            studentId: student.id,
            classId: cls.id,
            academicYearId: cls.academicYearId
          }
        });
      }

      return student.id;
    });

    return Response.json(
      { student: await loadStudent(id) },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );

  } catch (error) {

    if (error.code === "NO_CLASS") {
      return jsonError("الشعبة المحددة غير موجودة.", 400);
    }

    if (error.code === "P2002") {
      return jsonError("رمز الطفل مسجل مسبقاً.", 409);
    }

    console.error("Students POST error:", error);

    return jsonError("حدث خطأ أثناء تسجيل الطفل.", 500);
  }
}
