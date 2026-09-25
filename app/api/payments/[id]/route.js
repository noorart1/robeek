
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

// حذف دفعة سُجّلت بالخطأ

export async function DELETE(request, { params }) {
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

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { Enrollment: { select: { studentId: true } } }
    });

    if (!payment) {
      return errorResponse("لم يتم العثور على الدفعة.", 404);
    }

    await prisma.payment.delete({ where: { id: paymentId } });

    return Response.json(
      {
        success: true,
        student: await loadStudent(payment.Enrollment.studentId)
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Payment DELETE error:", error);

    return errorResponse("حدث خطأ أثناء حذف الدفعة.", 500);
  }
}
