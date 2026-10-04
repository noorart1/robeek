
import prisma from "../../../../../lib/prisma";
import { requireFinance } from "../../../../../lib/auth";
import { errorResponse, readBody } from "../../../../../lib/users";
import { salaryPaid } from "../../../../../lib/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// إلغاء وصل راتب: PATCH { void: true, reason? }. Like a child's receipt,
// it is never deleted: it keeps its number, stays listed (struck through)
// and stops counting towards what was paid.

export async function PATCH(request, { params }) {
  try {
    const { user, response } = await requireFinance("salaries", true);
    if (response) return response;

    const id = Number((await params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return errorResponse("معرّف الدفعة غير صالح.", 400);

    const body = await readBody(request);
    if (body?.void !== true) return errorResponse("البيانات المرسلة غير صالحة.", 400);

    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 191) : null;

    // Voiding a payment must not leave more refunded than paid.
    const payment = await prisma.salaryPayment.findUnique({
      where: { id },
      include: { Salary: { include: { SalaryPayment: true } } }
    });
    if (!payment) return errorResponse("لم يتم العثور على الدفعة.", 404);
    const after = payment.Salary.SalaryPayment.filter((p) => p.id !== id);
    if (!payment.voidedAt && salaryPaid(after) < 0) {
      return errorResponse("على هذا الشهر استرجاع؛ ألغِ الاسترجاع أولاً.", 409);
    }

    const { count } = await prisma.salaryPayment.updateMany({
      where: { id, voidedAt: null },
      data: { voidedAt: new Date(), voidReason: reason }
    });
    if (!count) return errorResponse("هذا الوصل ملغى مسبقاً.", 409);

    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Salary payment PATCH error:", error);
    return errorResponse("حدث خطأ أثناء إلغاء الوصل.", 500);
  }
}
