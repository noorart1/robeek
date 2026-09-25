
import prisma from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { loadStudent } from "../../../../lib/student-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message, status) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

// إلغاء وصل: PATCH { void: true, reason? }.
// Payments are never deleted: a receipt that was printed and handed to a
// parent keeps its number and stays listed (struck through), it just
// stops counting towards what was paid.

export async function PATCH(request, { params }) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "ADMIN") {
      return errorResponse("ليس لديك صلاحية الوصول.", 401);
    }

    const { id } = await params;
    const paymentId = Number(id);

    if (!Number.isSafeInteger(paymentId) || paymentId <= 0) {
      return errorResponse("معرّف الدفعة غير صالح.", 400);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return errorResponse("البيانات المرسلة غير صالحة.", 400);
    }

    if (body?.void !== true) {
      return errorResponse("البيانات المرسلة غير صالحة.", 400);
    }

    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim().slice(0, 191)
        : null;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { voidedAt: true, Enrollment: { select: { studentId: true } } }
    });

    if (!payment) {
      return errorResponse("لم يتم العثور على الدفعة.", 404);
    }

    if (payment.voidedAt) {
      return errorResponse("هذا الوصل ملغى مسبقاً.", 409);
    }

    await prisma.payment.update({
      where: { id: paymentId },
      data: { voidedAt: new Date(), voidReason: reason }
    });

    return Response.json(
      {
        success: true,
        student: await loadStudent(payment.Enrollment.studentId)
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Payment PATCH error:", error);

    return errorResponse("حدث خطأ أثناء إلغاء الوصل.", 500);
  }
}
