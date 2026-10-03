
import prisma from "../../../lib/prisma";
import { requireAdmin } from "../../../lib/auth";
import { errorResponse, readBody } from "../../../lib/users";
import { checkStaff, formatStaff, payChange } from "../../../lib/staff";
import { yearMonths } from "../../../lib/finance";
import { yearView } from "../../../lib/year-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// الكادر: list (GET) and add (POST) staff. Admins only — it holds salaries.
// For an earlier year chosen in the header, GET lists who worked then:
// paid a salary in its months, or heading one of its sections.

export async function GET() {
  try {
    const { user, response } = await requireAdmin();
    if (response) return response;

    const { year, isActive } = await yearView();
    const months = !isActive && yearMonths(year.name);
    const staff = await prisma.staff.findMany({
      where: isActive ? undefined : {
        OR: [
          ...(months ? [{ Salary: { some: { month: { gte: months.from, lte: months.to } } } }] : []),
          { Class: { some: { academicYearId: year.id } } }
        ]
      },
      orderBy: [{ isActive: "desc" }, { id: "asc" }]
    });

    return Response.json(
      { staff: staff.map(formatStaff), pastYear: isActive ? null : year.name },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Staff GET error:", error);
    return errorResponse("حدث خطأ أثناء تحميل الكادر.", 500);
  }
}

export async function POST(request) {
  try {
    const { user, response } = await requireAdmin();
    if (response) return response;

    const body = await readBody(request);
    if (!body) return errorResponse("البيانات المرسلة غير صالحة.", 400);

    const checked = checkStaff(body);
    if (checked.error) return errorResponse(checked.error, 400, { field: checked.field });

    const staff = await prisma.$transaction(async (tx) => {
      const created = await tx.staff.create({ data: { ...checked.data, updatedAt: new Date() } });
      // The starting pay opens سجل تغيير الراتب.
      const change = payChange(created.id, {}, checked.data, user);
      if (change) await tx.staffPayChange.create({ data: change });
      return created;
    });

    return Response.json({ staff: formatStaff(staff) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Staff POST error:", error);
    return errorResponse("حدث خطأ أثناء حفظ الموظف.", 500);
  }
}
