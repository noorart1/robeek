
import prisma from "../../../../../lib/prisma";
import { getCurrentUser } from "../../../../../lib/auth";
import { parseAmount } from "../../../../../lib/digits";
import { PAYMENT_TYPES } from "../../../../../lib/labels";
import { loadStudent } from "../../../../../lib/student-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message, status, extra = {}) {
  return Response.json(
    { error: message, ...extra },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

// تسجيل دفعة: a payment against the child's current enrollment.

export async function POST(request, { params }) {
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

    const amount = parseAmount(body?.amount);

    if (!amount) {
      return errorResponse("يرجى إدخال مبلغ الدفعة بالأرقام.", 400, { field: "amount" });
    }

    const paymentType = body.paymentType || "TUITION";

    if (!(paymentType in PAYMENT_TYPES)) {
      return errorResponse("نوع الدفعة غير صالح.", 400, { field: "paymentType" });
    }

    const description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim().slice(0, 500)
        : null;

    // Active academic year first, otherwise the newest enrollment.
    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId },
      orderBy: [{ AcademicYear: { isActive: "desc" } }, { id: "desc" }]
    });

    if (!enrollment) {
      return errorResponse("يرجى تسجيل الطفل في شعبة قبل إضافة دفعة.", 400);
    }

    await prisma.payment.create({
      data: {
        enrollmentId: enrollment.id,
        amount,
        paymentType,
        description
      }
    });

    return Response.json(
      { success: true, student: await loadStudent(studentId) },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Payment POST error:", error);

    return errorResponse("حدث خطأ أثناء حفظ الدفعة.", 500);
  }
}
