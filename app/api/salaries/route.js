
import prisma from "../../../lib/prisma";
import { getCurrentUser } from "../../../lib/auth";
import { errorResponse, readBody } from "../../../lib/users";
import { checkSalary, formatSalary, formatStaff, isMonth } from "../../../lib/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// الرواتب of one month.
//   GET ?month=2026-09 → { staff, salaries }: the active staff, plus anyone
//   inactive who was paid that month.

export async function GET(request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") return errorResponse("ليس لديك صلاحية الوصول.", 401);

    const month = new URL(request.url).searchParams.get("month");
    if (!isMonth(month)) return errorResponse("الشهر غير صالح.", 400);

    const salaries = await prisma.salary.findMany({ where: { month } });
    const staff = await prisma.staff.findMany({
      where: { OR: [{ isActive: true }, { id: { in: salaries.map((s) => s.staffId) } }] },
      orderBy: { id: "asc" }
    });

    return Response.json(
      { staff: staff.map(formatStaff), salaries: salaries.map(formatSalary) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Salaries GET error:", error);
    return errorResponse("حدث خطأ أثناء تحميل الرواتب.", 500);
  }
}

//   PUT { staffId, month, baseSalary, bonus?, deduction?, paidOn?, paymentMethod?, notes? }
// Records (or corrects) that person's salary for that month.

export async function PUT(request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") return errorResponse("ليس لديك صلاحية الوصول.", 401);

    const body = await readBody(request);
    if (!body) return errorResponse("البيانات المرسلة غير صالحة.", 400);

    const checked = checkSalary(body);
    if (checked.error) return errorResponse(checked.error, 400, { field: checked.field });

    const { staffId, month, ...fields } = checked.data;
    const salary = await prisma.salary.upsert({
      where: { staffId_month: { staffId, month } },
      create: { staffId, month, ...fields, updatedAt: new Date() },
      update: { ...fields, updatedAt: new Date() }
    });

    return Response.json({ salary: formatSalary(salary) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error.code === "P2003") return errorResponse("الموظف غير موجود.", 404);
    console.error("Salaries PUT error:", error);
    return errorResponse("حدث خطأ أثناء حفظ الراتب.", 500);
  }
}
