
import prisma from "../../../../../lib/prisma";
import { requireOffice } from "../../../../../lib/auth";
import { parseAmount } from "../../../../../lib/digits";
import { PAYMENT_METHODS, PAYMENT_TYPES } from "../../../../../lib/labels";
import { loadStudent } from "../../../../../lib/student-data";
import { REFUND_TYPES, paidTotals } from "../../../../../lib/finance";
import { nextSequence } from "../../../../../lib/sequence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message, status, extra = {}) {
  return Response.json(
    { error: message, ...extra },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

// Receipt numbers per academic year: "2025-2026" → 2526-0001, 2526-0002…,
// a summer course "صيف 2026" → SU26-0001. From the Sequence table,
// incremented inside the payment's transaction (lib/sequence.js), so a
// number is never given twice — not even after its payment is gone.
async function nextReceiptNo(tx, yearName) {
  const match = /^\d{2}(\d{2})\s*-\s*\d{2}(\d{2})$/.exec(yearName || "");
  const summer = /^صيف \d{2}(\d{2})$/.exec(yearName || "");
  const prefix = match ? `${match[1]}${match[2]}` : summer ? `SU${summer[1]}` : "R";

  return `${prefix}-${String(await nextSequence(tx, `receipt-${prefix}`)).padStart(4, "0")}`;
}

// تسجيل دفعة: a payment against the child's current enrollment.

export async function POST(request, { params }) {
  try {
    const { user, response } = await requireOffice();
    if (response) return response;

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

    const paymentMethod = body.paymentMethod || "CASH";

    if (!(paymentMethod in PAYMENT_METHODS)) {
      return errorResponse("نوع الدفع غير صالح.", 400, { field: "paymentMethod" });
    }

    const description =
      typeof body.description === "string" && body.description.trim()
        ? body.description.trim().slice(0, 500)
        : null;

    // enrollmentId: the enrollment paid for — the summer course's, or an
    // earlier year's («عن» that year). The dialog always sends it. Without
    // it: the active school year first, then the newest enrollment.
    const enrollmentId = body.enrollmentId ? Number(body.enrollmentId) : null;

    if (enrollmentId !== null && (!Number.isSafeInteger(enrollmentId) || enrollmentId <= 0)) {
      return errorResponse("السنة الدراسية غير صالحة.", 400, { field: "enrollmentId" });
    }

    const enrollment = await prisma.enrollment.findFirst({
      where: { studentId, ...(enrollmentId && { id: enrollmentId }) },
      orderBy: [{ AcademicYear: { isActive: "desc" } }, { AcademicYear: { kind: "asc" } }, { id: "desc" }],
      include: { AcademicYear: { select: { name: true } } }
    });

    if (!enrollment) {
      return errorResponse("يرجى تسجيل الطفل في شعبة قبل إضافة دفعة.", 400);
    }

    // A refund can only give back what was paid, that year and of that kind.
    if (REFUND_TYPES.includes(paymentType)) {
      const paid = paidTotals(await prisma.payment.findMany({ where: { enrollmentId: enrollment.id } }));
      const available = paymentType === "REFUND" ? paid.tuition : paid.curriculum;

      if (amount > available) {
        return errorResponse(
          `لا يمكن استرجاع أكثر من المدفوع (${available.toLocaleString("en-US")} د.ع).`,
          400,
          { field: "amount" }
        );
      }
    }

    const payment = await prisma.$transaction(async (tx) =>
      tx.payment.create({
        data: {
          enrollmentId: enrollment.id,
          amount,
          paymentType,
          paymentMethod,
          description,
          receiptNo: await nextReceiptNo(tx, enrollment.AcademicYear.name)
        },
        select: { id: true, receiptNo: true }
      })
    );

    return Response.json(
      { success: true, payment, student: await loadStudent(studentId) },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Payment POST error:", error);

    return errorResponse("حدث خطأ أثناء حفظ الدفعة.", 500);
  }
}
