
import prisma from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { errorResponse } from "../../../../lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Removes a salary recorded by mistake.

export async function DELETE(request, { params }) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") return errorResponse("ليس لديك صلاحية الوصول.", 401);

    const id = Number((await params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return errorResponse("معرّف الراتب غير صالح.", 400);

    // Receipts are never deleted, so neither is a month that has any.
    if (await prisma.salaryPayment.count({ where: { salaryId: id } })) {
      return errorResponse("لهذا الشهر دفعات مسجلة؛ ألغِ الوصولات بدلاً من الحذف.", 409);
    }

    await prisma.salary.delete({ where: { id } });

    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error.code === "P2025") return errorResponse("الراتب غير موجود.", 404);
    console.error("Salary DELETE error:", error);
    return errorResponse("حدث خطأ أثناء حذف الراتب.", 500);
  }
}
