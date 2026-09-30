
import prisma from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { errorResponse, readBody } from "../../../../lib/users";
import { checkStaff, formatSalary, formatSalaryPayment, formatStaff, netSalary, payChange, salaryPaid } from "../../../../lib/staff";
import { iraqToday } from "../../../../lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function staffId(params) {
  const id = Number((await params).id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

//   GET → { staff, salaries, payments, changes }, newest first: the person,
//   what they were due each month (with paid / remaining), every salary
//   payment (voided ones too, as for a child) and every change of pay.

export async function GET(request, { params }) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") return errorResponse("ليس لديك صلاحية الوصول.", 401);

    const id = await staffId(params);
    if (!id) return errorResponse("معرّف الموظف غير صالح.", 400);

    const staff = await prisma.staff.findUnique({
      where: { id },
      include: {
        Salary: { orderBy: { month: "desc" }, include: { SalaryPayment: true } },
        StaffPayChange: { orderBy: { id: "desc" } }
      }
    });
    if (!staff) return errorResponse("الموظف غير موجود.", 404);

    const { Salary, StaffPayChange, ...person } = staff;
    const amount = (value) => (value === null ? null : Number(value));
    const changes = StaffPayChange.map((c) => ({
      ...c,
      oldBaseSalary: amount(c.oldBaseSalary),
      newBaseSalary: amount(c.newBaseSalary),
      oldBonus: amount(c.oldBonus),
      newBonus: amount(c.newBonus)
    }));
    const payments = Salary
      .flatMap((s) => s.SalaryPayment.map((p) => formatSalaryPayment({ ...p, month: s.month })))
      .sort((a, b) => b.id - a.id);
    return Response.json(
      { staff: formatStaff(person), salaries: Salary.map(formatSalary), payments, changes },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Staff GET error:", error);
    return errorResponse("حدث خطأ أثناء تحميل الموظف.", 500);
  }
}

//   PATCH { every field of the form }

export async function PATCH(request, { params }) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") return errorResponse("ليس لديك صلاحية الوصول.", 401);

    const id = await staffId(params);
    if (!id) return errorResponse("معرّف الموظف غير صالح.", 400);

    const body = await readBody(request);
    if (!body) return errorResponse("البيانات المرسلة غير صالحة.", 400);

    const checked = checkStaff(body);
    if (checked.error) return errorResponse(checked.error, 400, { field: checked.field });

    const { baseSalary, bonus } = checked.data;
    // The current month's salary (and any later one) follows «الكادر»;
    // earlier months stay as they were paid.
    const before = await prisma.staff.findUnique({ where: { id }, select: { baseSalary: true, bonus: true } });
    if (!before) return errorResponse("الموظف غير موجود.", 404);
    const change = payChange(id, before, checked.data, user);
    const current = baseSalary === null || !change
      ? []
      : await prisma.salary.findMany({
          where: { staffId: id, month: { gte: iraqToday().slice(0, 7) } },
          include: { SalaryPayment: true }
        });
    if (current.some((s) => netSalary({ baseSalary, bonus, deduction: s.deduction }) < salaryPaid(s.SalaryPayment))) {
      return errorResponse("الراتب الجديد أقل مما دُفع لهذا الشهر (أو من خصوماته).", 400, { field: "baseSalary" });
    }

    const [staff] = await prisma.$transaction([
      prisma.staff.update({
        where: { id },
        data: { ...checked.data, updatedAt: new Date() }
      }),
      ...current.map((s) =>
        prisma.salary.update({
          where: { id: s.id },
          data: { baseSalary, bonus: bonus ?? 0, updatedAt: new Date() }
        })
      ),
      ...(change ? [prisma.staffPayChange.create({ data: change })] : [])
    ]);

    return Response.json({ staff: formatStaff(staff) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error.code === "P2025") return errorResponse("الموظف غير موجود.", 404);
    console.error("Staff PATCH error:", error);
    return errorResponse("حدث خطأ أثناء حفظ الموظف.", 500);
  }
}

// Only for someone entered by mistake: once a salary is recorded, the
// person is kept and marked غير نشط instead.

export async function DELETE(request, { params }) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") return errorResponse("ليس لديك صلاحية الوصول.", 401);

    const id = await staffId(params);
    if (!id) return errorResponse("معرّف الموظف غير صالح.", 400);

    if (await prisma.salary.count({ where: { staffId: id } })) {
      return errorResponse("لهذا الموظف رواتب مسجلة؛ اجعله «غير نشط» بدلاً من الحذف.", 409);
    }

    await prisma.staff.delete({ where: { id } });

    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error.code === "P2025") return errorResponse("الموظف غير موجود.", 404);
    console.error("Staff DELETE error:", error);
    return errorResponse("حدث خطأ أثناء حذف الموظف.", 500);
  }
}
