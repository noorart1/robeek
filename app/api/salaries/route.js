
import prisma from "../../../lib/prisma";
import { requireAdmin } from "../../../lib/auth";
import { errorResponse, readBody } from "../../../lib/users";
import { checkSalary, formatSalary, formatStaff, isMonth, netSalary, payChange, salaryPaid } from "../../../lib/staff";
import { formatExpense } from "../../../lib/finance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// الرواتب of one month.
//   GET ?month=2026-09 → { staff, salaries }: the active staff, plus anyone
//   inactive who is due a salary that month. Each salary carries paid and
//   remaining (دفعات الرواتب, voided ones excluded). lumps: salaries the
//   accounts ledger holds only as a monthly total («رواتب (مجموع)»).

export async function GET(request) {
  try {
    const { user, response } = await requireAdmin();
    if (response) return response;

    const month = new URL(request.url).searchParams.get("month");
    if (!isMonth(month)) return errorResponse("الشهر غير صالح.", 400);

    const salaries = await prisma.salary.findMany({ where: { month }, include: { SalaryPayment: true } });
    const from = new Date(`${month}-01T00:00:00.000Z`);
    const lumps = await prisma.expense.findMany({
      where: { category: "SALARY", date: { gte: from, lt: new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1)) } },
      orderBy: { date: "asc" }
    });
    const staff = await prisma.staff.findMany({
      where: { OR: [{ isActive: true }, { id: { in: salaries.map((s) => s.staffId) } }] },
      orderBy: { id: "asc" }
    });

    return Response.json(
      { staff: staff.map(formatStaff), salaries: salaries.map(formatSalary), lumps: lumps.map(formatExpense) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Salaries GET error:", error);
    return errorResponse("حدث خطأ أثناء تحميل الرواتب.", 500);
  }
}

//   PUT { staffId, month, baseSalary, deduction?, notes? }
// Sets (or corrects) what that person is due for that month. Paying it
// is POST /api/salaries/payments.

export async function PUT(request) {
  try {
    const { user, response } = await requireAdmin();
    if (response) return response;

    const body = await readBody(request);
    if (!body) return errorResponse("البيانات المرسلة غير صالحة.", 400);

    const checked = checkSalary(body);
    if (checked.error) return errorResponse(checked.error, 400, { field: checked.field });

    const { staffId, month, ...fields } = checked.data;
    const existing = await prisma.salary.findUnique({
      where: { staffId_month: { staffId, month } },
      include: { SalaryPayment: true }
    });
    if (existing && netSalary(fields) < salaryPaid(existing.SalaryPayment)) {
      return errorResponse("الصافي أقل مما دُفع لهذا الشهر؛ ألغِ دفعة أولاً.", 400, { field: "deduction" });
    }

    const salary = await prisma.$transaction(async (tx) => {
      const saved = await tx.salary.upsert({
        where: { staffId_month: { staffId, month } },
        create: { staffId, month, ...fields, updatedAt: new Date() },
        update: { ...fields, updatedAt: new Date() },
        include: { SalaryPayment: true }
      });

      // The person's newest recorded month is their current pay: keep
      // «الكادر» showing the same salary.
      const newer = await tx.salary.count({ where: { staffId, month: { gt: month } } });
      if (!newer) {
        const before = await tx.staff.findUnique({ where: { id: staffId }, select: { baseSalary: true } });
        const change = before && payChange(staffId, before, fields, user);
        if (change) {
          await tx.staff.update({
            where: { id: staffId },
            data: { baseSalary: fields.baseSalary, updatedAt: new Date() }
          });
          await tx.staffPayChange.create({ data: change });
        }
      }
      return saved;
    });

    return Response.json({ salary: formatSalary(salary) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error.code === "P2003") return errorResponse("الموظف غير موجود.", 404);
    console.error("Salaries PUT error:", error);
    return errorResponse("حدث خطأ أثناء حفظ الراتب.", 500);
  }
}
