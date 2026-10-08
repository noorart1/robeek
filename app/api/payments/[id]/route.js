
import prisma from "../../../../lib/prisma";
import { requireOffice } from "../../../../lib/auth";
import { loadStudent } from "../../../../lib/student-data";
import { checkPayment, paidTotals } from "../../../../lib/finance";
import { dayString, parseDay } from "../../../../lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message, status, extra = {}) {
  return Response.json(
    { error: message, ...extra },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

// إلغاء وصل: PATCH { void: true, reason? }.
// Payments are never deleted: a receipt that was printed and handed to a
// parent keeps its number and stays listed (struck through), it just
// stops counting towards what was paid.
//
// تعديل وصل: PATCH { amount, paymentType, paymentMethod, description,
// paymentDate: "YYYY-MM-DD" }, validated as when it was recorded. It keeps
// its number and its enrollment; a voided one cannot be edited.

export async function PATCH(request, { params }) {
  try {
    const { user, response } = await requireOffice();
    if (response) return response;

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

    if (!body || typeof body !== "object") {
      return errorResponse("البيانات المرسلة غير صالحة.", 400);
    }

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { voidedAt: true, enrollmentId: true, paymentDate: true, Enrollment: { select: { studentId: true } } }
    });

    if (!payment) {
      return errorResponse("لم يتم العثور على الدفعة.", 404);
    }

    if (payment.voidedAt) {
      return errorResponse("هذا الوصل ملغى مسبقاً.", 409);
    }

    if (body.void === true) {
      const reason =
        typeof body.reason === "string" && body.reason.trim()
          ? body.reason.trim().slice(0, 191)
          : null;

      await prisma.payment.update({
        where: { id: paymentId },
        data: { voidedAt: new Date(), voidReason: reason }
      });
    } else {
      const checked = checkPayment(body);

      if (checked.error) {
        return errorResponse(checked.error, 400, { field: checked.field });
      }

      // The same day keeps the time it was recorded at.
      const day = parseDay(body.paymentDate);

      if (!day) {
        return errorResponse("التاريخ غير صالح.", 400, { field: "paymentDate" });
      }

      const paymentDate = dayString(payment.paymentDate) === body.paymentDate ? payment.paymentDate : day;

      // A refund can only give back what was paid, that year and of that
      // kind: the edit may not leave more refunded than paid (unless it
      // already was, and the edit does not make it worse).
      const others = await prisma.payment.findMany({
        where: { enrollmentId: payment.enrollmentId, id: { not: paymentId } }
      });
      const before = paidTotals([...others, await prisma.payment.findUnique({ where: { id: paymentId } })]);
      const after = paidTotals([...others, checked.data]);

      for (const kind of ["tuition", "curriculum"]) {
        if (after[kind] < 0 && after[kind] < before[kind]) {
          return errorResponse("لا يمكن: سيصبح المسترجع أكثر من المدفوع.", 400, { field: "amount" });
        }
      }

      await prisma.payment.update({
        where: { id: paymentId },
        data: { ...checked.data, paymentDate }
      });
    }

    return Response.json(
      {
        success: true,
        student: await loadStudent(payment.Enrollment.studentId)
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Payment PATCH error:", error);

    return errorResponse("حدث خطأ أثناء حفظ الوصل.", 500);
  }
}
