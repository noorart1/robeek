
import prisma from "../../../lib/prisma";
import { requireFinance } from "../../../lib/auth";
import { CATEGORY_TAB, canFinance } from "../../../lib/finance-access";
import { errorResponse, readBody } from "../../../lib/users";
import { isMonth } from "../../../lib/staff";
import { checkExpense, formatExpense } from "../../../lib/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// المصاريف. Admins, and a معاون for the tabs given to them.
//   GET ?month=2026-09 → that month's expenses, oldest first (a معاون's:
//   only those of their tabs).

export async function GET(request) {
  try {
    const { user, response } = await requireFinance(["general", "fixed", "box"]);
    if (response) return response;

    const month = new URL(request.url).searchParams.get("month");
    if (!isMonth(month)) return errorResponse("الشهر غير صالح.", 400);

    const [year, m] = month.split("-").map(Number);
    const expenses = await prisma.expense.findMany({
      where: {
        date: { gte: new Date(Date.UTC(year, m - 1, 1)), lt: new Date(Date.UTC(year, m, 1)) },
        category: { in: Object.keys(CATEGORY_TAB).filter((c) => canFinance(user, CATEGORY_TAB[c])) }
      },
      orderBy: [{ date: "asc" }, { id: "asc" }]
    });

    return Response.json({ expenses: expenses.map(formatExpense) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Expenses GET error:", error);
    return errorResponse("حدث خطأ أثناء تحميل المصاريف.", 500);
  }
}

//   POST { date, item, amount, category?, paymentMethod?, notes? }

export async function POST(request) {
  try {
    const { user, response } = await requireFinance(["general", "fixed", "box"], true);
    if (response) return response;

    const body = await readBody(request);
    if (!body) return errorResponse("البيانات المرسلة غير صالحة.", 400);

    const checked = checkExpense(body);
    if (checked.error) return errorResponse(checked.error, 400, { field: checked.field });
    if (!canFinance(user, CATEGORY_TAB[checked.data.category], true)) {
      return errorResponse("ليس لديك صلاحية الوصول.", 403);
    }

    const expense = await prisma.expense.create({ data: { ...checked.data, updatedAt: new Date() } });

    return Response.json({ expense: formatExpense(expense) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Expenses POST error:", error);
    return errorResponse("حدث خطأ أثناء حفظ المصروف.", 500);
  }
}
