
import prisma from "../../../../../lib/prisma";
import { getCurrentUser } from "../../../../../lib/auth";
import { defaultEnrollmentDate, validateEnrollment } from "../../../../../lib/enrollment-fields";
import { loadStudent } from "../../../../../lib/student-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message, status, extra = {}) {
  return Response.json(
    { error: message, ...extra },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

// تسجيل الطفل في شعبة: section, fee and attendance type for the section's
// academic year. Creates the enrollment the first time, updates it after.

export async function PUT(request, { params }) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "ADMIN") {
      return errorResponse("ليس لديك صلاحية الوصول.", 401);
    }

    const { id } = await params;
    const studentId = Number(id);

    if (!Number.isSafeInteger(studentId) || studentId <= 0) {
      return errorResponse("معرّف الطفل غير صالح.", 400);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return errorResponse("البيانات المرسلة غير صالحة.", 400);
    }

    const checked = validateEnrollment(body);

    if (checked.error) {
      return errorResponse(checked.error, 400, { field: checked.field });
    }

    const { data } = checked;

    const [student, cls] = await Promise.all([
      prisma.student.findUnique({ where: { id: studentId }, select: { id: true } }),
      prisma.class.findUnique({ where: { id: data.classId }, include: { AcademicYear: { select: { name: true, isActive: true } } } })
    ]);

    if (!student) {
      return errorResponse("لم يتم العثور على الطفل المطلوب.", 404);
    }

    if (!cls) {
      return errorResponse("الشعبة المحددة غير موجودة.", 400, { field: "classId" });
    }

    await prisma.enrollment.upsert({
      where: {
        studentId_academicYearId: {
          studentId,
          academicYearId: cls.academicYearId
        }
      },
      create: {
        enrollmentDate: defaultEnrollmentDate(cls.AcademicYear.name, cls.shift),
        ...data,
        studentId,
        academicYearId: cls.academicYearId
      },
      update: data
    });

    // Registered for the running year: the child is here again.
    if (cls.AcademicYear.isActive) {
      await prisma.student.update({ where: { id: studentId }, data: { status: "ACTIVE", updatedAt: new Date() } });
    }

    return Response.json(
      { success: true, student: await loadStudent(studentId) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Enrollment PUT error:", error);

    return errorResponse("حدث خطأ أثناء حفظ بيانات التسجيل.", 500);
  }
}
