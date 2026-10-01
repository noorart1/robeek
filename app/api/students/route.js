
import prisma from "../../../lib/prisma";
import { getCurrentUser } from "../../../lib/auth";
import { toWesternDigits } from "../../../lib/digits";
import { validateField } from "../../../lib/student-fields";
import { defaultEnrollmentDate, validateEnrollment } from "../../../lib/enrollment-fields";
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

function jsonError(message, status, extra = {}) {
  return Response.json(
    { error: message, ...extra },
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

// Next code for a section, following the imported pattern M-A-07;
// children without a section get S-001, S-002, ... It is the highest
// existing number + 1: gaps left by deleted children are not filled, but
// deleting the highest-numbered child makes its number available again.
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

function parsePhone(value, field) {
  const phone =
    typeof value === "string" ? toWesternDigits(value.trim()) : "";

  if (phone && !/^[+]?[0-9\s()-]{7,30}$/.test(phone)) {
    return { error: "رقم الهاتف غير صالح.", field };
  }

  return { value: phone || null };
}

function parseName(value, field) {
  if (value !== undefined && value !== null && (typeof value !== "string" || value.length > 100)) {
    return { error: "الاسم غير صالح.", field };
  }

  return { value: (value || "").trim() || null };
}

// A parent already recorded with this phone in the same role (a sibling's
// father or mother) is reused rather than duplicated.
async function findOrCreateParent(tx, relation, phone, data) {
  if (phone) {
    const existing = await tx.parent.findFirst({
      where: { phone, StudentParent: { some: { relation } } }
    });

    if (existing) return { id: existing.id, existing: true };
  }

  const created = await tx.parent.create({
    data: { ...data, phone, updatedAt: new Date() }
  });

  return { id: created.id, existing: false };
}

// تسجيل طفل جديد:
//   POST { fields: { firstName, fatherName, ... },
//          enrollment?: { classId, tuitionFee, attendanceType, paymentPlan, enrollmentDate },
//          parents?: { fatherPhone, motherName, motherPhone } }
// Everything is validated first and saved in one transaction, so a bad
// value never leaves a half-created child behind.

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

    // Older shape: the name fields and classId at the top level.
    const fields =
      body.fields && typeof body.fields === "object" && !Array.isArray(body.fields)
        ? { ...body.fields }
        : Object.fromEntries(
            ["studentCode", "firstName", "fatherName", "grandfatherName", "lastName"]
              .filter((key) => typeof body[key] === "string")
              .map((key) => [key, body[key]])
          );
    const enrollmentInput =
      body.enrollment ?? (body.classId ? { classId: body.classId } : null);

    // A blank code is generated from the section below.
    if (!fields.studentCode || !String(fields.studentCode).trim()) {
      delete fields.studentCode;
    }

    if (!fields.firstName || !String(fields.firstName).trim()) {
      return jsonError("يرجى إدخال اسم الطفل.", 400, { field: "firstName" });
    }

    const data = {};

    for (const [field, value] of Object.entries(fields)) {
      const checked = validateField(field, value);

      if (checked.error) {
        return jsonError(checked.error, 400, { field });
      }

      data[field] = checked.value;
    }

    let enrollment = null;

    if (enrollmentInput && enrollmentInput.classId) {
      const checked = validateEnrollment(enrollmentInput);

      if (checked.error) {
        return jsonError(checked.error, 400, { field: checked.field });
      }

      enrollment = checked.data;
    }

    const parents = body.parents || {};
    const fatherPhone = parsePhone(parents.fatherPhone, "fatherPhone");
    const motherPhone = parsePhone(parents.motherPhone, "motherPhone");
    const motherName = parseName(parents.motherName, "motherName");

    for (const checked of [fatherPhone, motherPhone, motherName]) {
      if (checked.error) {
        return jsonError(checked.error, 400, { field: checked.field });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const cls = enrollment
        ? await tx.class.findUnique({ where: { id: enrollment.classId }, include: { AcademicYear: { select: { name: true } } } })
        : null;

      if (enrollment && !cls) {
        throw Object.assign(new Error("class"), { code: "NO_CLASS" });
      }

      const student = await tx.student.create({
        data: {
          ...data,
          studentCode: data.studentCode || (await nextStudentCode(tx, cls)),
          updatedAt: new Date()
        },
        select: { id: true }
      });

      if (cls) {
        await tx.enrollment.create({
          data: {
            enrollmentDate: defaultEnrollmentDate(cls.AcademicYear.name, cls.shift),
            ...enrollment,
            studentId: student.id,
            academicYearId: cls.academicYearId
          }
        });
      }

      const linked = {};

      // The father's name comes from the child's own name:
      // «علي حسين كاظم» → father «حسين كاظم».
      if (data.fatherName || fatherPhone.value) {
        const father = await findOrCreateParent(tx, "FATHER", fatherPhone.value, {
          firstName: data.fatherName || null,
          lastName: [data.grandfatherName, data.lastName].filter(Boolean).join(" ") || null
        });
        await tx.studentParent.create({
          data: { studentId: student.id, parentId: father.id, relation: "FATHER" }
        });
        linked.father = father.existing;
      }

      if (motherName.value || motherPhone.value) {
        const mother = await findOrCreateParent(tx, "MOTHER", motherPhone.value, {
          firstName: motherName.value,
          lastName: null
        });
        await tx.studentParent.create({
          data: { studentId: student.id, parentId: mother.id, relation: "MOTHER" }
        });
        linked.mother = mother.existing;
      }

      return { id: student.id, linked };
    });

    return Response.json(
      {
        student: await loadStudent(result.id),
        linkedExistingParents: result.linked
      },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );

  } catch (error) {

    if (error.code === "NO_CLASS") {
      return jsonError("الشعبة المحددة غير موجودة.", 400, { field: "classId" });
    }

    if (error.code === "P2002") {
      const field = String(error.meta?.target || "").includes("nationalId")
        ? "nationalId"
        : "studentCode";

      return jsonError(
        field === "nationalId"
          ? "الرقم الوطني مسجل مسبقاً لطفل آخر."
          : "رمز الطفل مسجل مسبقاً.",
        409,
        { field }
      );
    }

    // Foreign key: the chosen transport line does not exist.
    if (error.code === "P2003") {
      return jsonError("خط النقل المحدد غير موجود.", 400, { field: "transportLineId" });
    }

    console.error("Students POST error:", error);

    return jsonError("حدث خطأ أثناء تسجيل الطفل.", 500);
  }
}
