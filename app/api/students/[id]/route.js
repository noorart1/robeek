
import prisma from "../../../../lib/prisma";
import { requireAdmin } from "../../../../lib/auth";
import { validateField } from "../../../../lib/student-fields";
import { loadStudent } from "../../../../lib/student-data";
import { deletePhoto } from "../../../../lib/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// پاسخ خطا

function errorResponse(message, status, extra = {}) {
  return Response.json(
    {
      error: message,
      ...extra
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

// ویرایش اطلاعات کودک

export async function PATCH(request, { params }) {
  try {

    // بررسی نشست مدیر

    const { user, response } = await requireAdmin();
    if (response) return response;

    // بررسی شناسه کودک

    const { id } = await params;

    const studentId = Number(id);

    if (
      !Number.isSafeInteger(studentId) ||
      studentId <= 0
    ) {
      return errorResponse(
        "معرّف الطفل غير صالح.",
        400
      );
    }

    // دریافت اطلاعات ارسالی

    let body;

    try {
      body = await request.json();
    } catch {
      return errorResponse(
        "البيانات المرسلة غير صالحة.",
        400
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return errorResponse(
        "البيانات المرسلة غير صالحة.",
        400
      );
    }

    const { updatedAt } = body;

    // A cell edit sends { field, value }; the full edit dialog sends
    // { fields: { name: value, ... } }. Both are validated identically
    // and saved in one conditional update.

    const changes =
      body.fields &&
      typeof body.fields === "object" &&
      !Array.isArray(body.fields)
        ? body.fields
        : { [body.field]: body.value };

    const entries = Object.entries(changes);

    if (entries.length === 0) {
      return errorResponse(
        "لا توجد تغييرات للحفظ.",
        400
      );
    }

    const data = {};

    for (const [field, value] of entries) {
      const checked = validateField(field, value);

      if (checked.error) {
        return errorResponse(checked.error, 400, { field });
      }

      data[field] = checked.value;
    }

    // بررسی نسخه اطلاعات برای جلوگیری از تداخل

    if (
      typeof updatedAt !== "string" ||
      !Number.isFinite(Date.parse(updatedAt))
    ) {
      return errorResponse(
        "إصدار البيانات غير صالح. يرجى تحديث الجدول.",
        400
      );
    }

    const expectedUpdatedAt = new Date(updatedAt);

    // ذخیره مشروط اطلاعات

    const result = await prisma.student.updateMany({
      where: {
        id: studentId,
        updatedAt: expectedUpdatedAt
      },
      data: {
        ...data,
        updatedAt: new Date()
      }
    });

    // بررسی تداخل ویرایش

    if (result.count === 0) {
      const currentStudent = await loadStudent(studentId);

      if (!currentStudent) {
        return errorResponse(
          "لم يتم العثور على الطفل المطلوب.",
          404
        );
      }

      return errorResponse(
        "تم تعديل بيانات هذا الطفل. يرجى تحديث الجدول قبل حفظ التغييرات.",
        409,
        {
          code: "EDIT_CONFLICT",
          student: currentStudent
        }
      );
    }

    // دریافت اطلاعات ذخیره‌شده

    const student = await loadStudent(studentId);

    return Response.json(
      {
        success: true,
        student
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {

    // جلوگیری از ثبت اطلاعات تکراری

    if (error.code === "P2002") {
      return errorResponse(
        "هذه القيمة مسجلة مسبقاً لطفل آخر.",
        409
      );
    }

    // Foreign key: the chosen transport line does not exist
    if (error.code === "P2003") {
      return errorResponse(
        "خط النقل المحدد غير موجود.",
        400,
        { field: "transportLineId" }
      );
    }

    console.error("Student PATCH error:", error);

    return errorResponse(
      "حدث خطأ أثناء حفظ بيانات الطفل.",
      500
    );
  }
}

// حذف طفل نهائياً, with everything that only belongs to them: attendance,
// payments, enrollments and the photo file. Parents are removed only when
// no other child is linked to them, so siblings keep theirs.
//
// For a child who has left, the table's «غير نشط» status is the better
// tool: it keeps the payment history the finance page reports on.

export async function DELETE(request, { params }) {
  try {
    const { user, response } = await requireAdmin();
    if (response) return response;

    const { id } = await params;
    const studentId = Number(id);

    if (!Number.isSafeInteger(studentId) || studentId <= 0) {
      return errorResponse("معرّف الطفل غير صالح.", 400);
    }

    const removed = await prisma.$transaction(async (tx) => {
      const student = await tx.student.findUnique({
        where: { id: studentId },
        select: {
          photo: true,
          StudentParent: { select: { parentId: true } },
          Enrollment: { select: { id: true } }
        }
      });

      if (!student) return null;

      const enrollmentIds = student.Enrollment.map((e) => e.id);
      const parentIds = student.StudentParent.map((link) => link.parentId);

      await tx.attendance.deleteMany({ where: { studentId } });
      await tx.payment.deleteMany({ where: { enrollmentId: { in: enrollmentIds } } });
      await tx.enrollment.deleteMany({ where: { studentId } });
      await tx.studentParent.deleteMany({ where: { studentId } });

      const orphans = await tx.parent.deleteMany({
        where: { id: { in: parentIds }, StudentParent: { none: {} } }
      });

      await tx.student.delete({ where: { id: studentId } });

      return { photo: student.photo, parentsRemoved: orphans.count };
    });

    if (!removed) {
      return errorResponse("لم يتم العثور على الطفل المطلوب.", 404);
    }

    // After the commit: a failed file delete must not undo the deletion.
    try {
      await deletePhoto(removed.photo);
    } catch (error) {
      console.error("Student photo cleanup error:", error);
    }

    return Response.json(
      { success: true, parentsRemoved: removed.parentsRemoved },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Student DELETE error:", error);

    return errorResponse("حدث خطأ أثناء حذف الطفل.", 500);
  }
}
