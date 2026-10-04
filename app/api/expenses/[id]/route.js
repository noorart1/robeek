
import prisma from "../../../../lib/prisma";
import { requireFinance } from "../../../../lib/auth";
import { CATEGORY_TAB, canFinance } from "../../../../lib/finance-access";
import { errorResponse, readBody } from "../../../../lib/users";
import { checkExpense, formatExpense } from "../../../../lib/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function expenseId(params) {
  const id = Number((await params).id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

//   PATCH { every field of the form }

export async function PATCH(request, { params }) {
  try {
    const { user, response } = await requireFinance(["general", "fixed", "box"], true);
    if (response) return response;

    const id = await expenseId(params);
    if (!id) return errorResponse("معرّف المصروف غير صالح.", 400);

    const body = await readBody(request);
    if (!body) return errorResponse("البيانات المرسلة غير صالحة.", 400);

    const current = await prisma.expense.findUnique({ where: { id }, select: { category: true } });
    if (!current) return errorResponse("المصروف غير موجود.", 404);

    const checked = checkExpense(body, current.category);
    if (checked.error) return errorResponse(checked.error, 400, { field: checked.field });
    // A معاون changes only their tabs' rows, and moves none out of them.
    if (![current.category, checked.data.category].every((c) => canFinance(user, CATEGORY_TAB[c], true))) {
      return errorResponse("ليس لديك صلاحية الوصول.", 403);
    }

    const expense = await prisma.expense.update({ where: { id }, data: { ...checked.data, updatedAt: new Date() } });

    return Response.json({ expense: formatExpense(expense) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error.code === "P2025") return errorResponse("المصروف غير موجود.", 404);
    console.error("Expense PATCH error:", error);
    return errorResponse("حدث خطأ أثناء حفظ المصروف.", 500);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { user, response } = await requireFinance(["general", "fixed", "box"], true);
    if (response) return response;

    const id = await expenseId(params);
    if (!id) return errorResponse("معرّف المصروف غير صالح.", 400);

    const current = await prisma.expense.findUnique({ where: { id }, select: { category: true } });
    if (!current) return errorResponse("المصروف غير موجود.", 404);
    if (!canFinance(user, CATEGORY_TAB[current.category], true)) {
      return errorResponse("ليس لديك صلاحية الوصول.", 403);
    }

    await prisma.expense.delete({ where: { id } });

    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error.code === "P2025") return errorResponse("المصروف غير موجود.", 404);
    console.error("Expense DELETE error:", error);
    return errorResponse("حدث خطأ أثناء حذف المصروف.", 500);
  }
}
