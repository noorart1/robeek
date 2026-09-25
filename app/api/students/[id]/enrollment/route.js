
import prisma from "../../../../../lib/prisma";
import { getCurrentUser } from "../../../../../lib/auth";
import { parseAmount } from "../../../../../lib/digits";
import { ATTENDANCE_TYPES, PAYMENT_PLANS } from "../../../../../lib/labels";
import { loadStudent } from "../../../../../lib/student-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message, status, extra = {}) {
  return Response.json(
    { error: message, ...extra },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + "T00:00:00.000Z");
  return date.toISOString().slice(0, 10) === value ? date : null;
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

    const classId = Number(body?.classId);

    if (!Number.isSafeInteger(classId) || classId <= 0) {
      return errorResponse("يرجى اختيار الشعبة.", 400, { field: "classId" });
    }

    const tuitionFee =
      body.tuitionFee === "" || body.tuitionFee === undefined
        ? 0
        : parseAmount(body.tuitionFee);

    if (tuitionFee === null) {
      return errorResponse("يرجى إدخال المبلغ الإجمالي بالأرقام.", 400, { field: "tuitionFee" });
    }

    const attendanceType = body.attendanceType || null;
    const paymentPlan = body.paymentPlan || null;

    if (attendanceType && !(attendanceType in ATTENDANCE_TYPES)) {
      return errorResponse("نوع الدوام غير صالح.", 400, { field: "attendanceType" });
    }

    if (paymentPlan && !(paymentPlan in PAYMENT_PLANS)) {
      return errorResponse("طريقة الدفع غير صالحة.", 400, { field: "paymentPlan" });
    }

    let enrollmentDate;

    if (body.enrollmentDate) {
      enrollmentDate = parseDate(String(body.enrollmentDate));

      if (!enrollmentDate) {
        return errorResponse("تاريخ المباشرة غير صالح.", 400, { field: "enrollmentDate" });
      }
    }

    const [student, cls] = await Promise.all([
      prisma.student.findUnique({ where: { id: studentId }, select: { id: true } }),
      prisma.class.findUnique({ where: { id: classId } })
    ]);

    if (!student) {
      return errorResponse("لم يتم العثور على الطفل المطلوب.", 404);
    }

    if (!cls) {
      return errorResponse("الشعبة المحددة غير موجودة.", 400, { field: "classId" });
    }

    const data = {
      classId,
      tuitionFee,
      attendanceType,
      paymentPlan,
      ...(enrollmentDate ? { enrollmentDate } : {})
    };

    await prisma.enrollment.upsert({
      where: {
        studentId_academicYearId: {
          studentId,
          academicYearId: cls.academicYearId
        }
      },
      create: {
        ...data,
        studentId,
        academicYearId: cls.academicYearId
      },
      update: data
    });

    return Response.json(
      { success: true, student: await loadStudent(studentId) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Enrollment PUT error:", error);

    return errorResponse("حدث خطأ أثناء حفظ بيانات التسجيل.", 500);
  }
}
