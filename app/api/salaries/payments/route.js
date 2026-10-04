
import prisma from "../../../../lib/prisma";
import { requireFinance } from "../../../../lib/auth";
import { errorResponse, readBody } from "../../../../lib/users";
import { iraqToday, parseDay } from "../../../../lib/dates";
import { checkSalaryPayment, formatSalaryPayment, netSalary, salaryPaid } from "../../../../lib/staff";
import { nextSequence } from "../../../../lib/sequence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Salary receipts: S-0001, S-0002… from the Sequence table, inside the
// payment's transaction, so a number is never given twice (lib/sequence.js).
async function nextReceiptNo(tx) {
  return `S-${String(await nextSequence(tx, "salary-receipt")).padStart(4, "0")}`;
}

//   POST { staffId, month, amount, paymentType?, paidOn?, paymentMethod?, description? }
// دفعة راتب, like a child's payment: one of possibly several for the
// month, never more than is left of it — or, as استرجاع (REFUND), money
// the person gives back, never more than was paid. A month with no
// salary set yet is due the person's الراتب الاسمي from الكادر.

export async function POST(request) {
  try {
    const { user, response } = await requireFinance("salaries", true);
    if (response) return response;

    const body = await readBody(request);
    if (!body) return errorResponse("البيانات المرسلة غير صالحة.", 400);

    const checked = checkSalaryPayment(body);
    if (checked.error) return errorResponse(checked.error, 400, { field: checked.field });

    const { staffId, month, ...fields } = checked.data;

    const payment = await prisma.$transaction(async (tx) => {
      let salary = await tx.salary.findUnique({
        where: { staffId_month: { staffId, month } },
        include: { SalaryPayment: true }
      });

      if (!salary) {
        const person = await tx.staff.findUnique({ where: { id: staffId } });
        if (!person) throw Object.assign(new Error("الموظف غير موجود."), { status: 404 });
        if (person.baseSalary === null) {
          throw Object.assign(new Error("حدّد الراتب الاسمي للموظف أولاً."), { status: 400, field: "amount" });
        }
        salary = await tx.salary.create({
          data: { staffId, month, baseSalary: person.baseSalary, updatedAt: new Date() },
          include: { SalaryPayment: true }
        });
      }

      // A payment fits in what is left; a refund in what was paid; a bonus
      // is on top of the salary, any amount.
      const paid = salaryPaid(salary.SalaryPayment);
      const room = fields.paymentType === "REFUND" ? paid : netSalary(salary) - paid;
      if (fields.paymentType !== "BONUS" && fields.amount > room) {
        const what = fields.paymentType === "REFUND" ? "المدفوع" : "الباقي";
        throw Object.assign(
          new Error(`المبلغ أكبر من ${what} لهذا الشهر (${room.toLocaleString("en-US")} د.ع).`),
          { status: 400, field: "amount" }
        );
      }

      return tx.salaryPayment.create({
        data: {
          salaryId: salary.id,
          ...fields,
          paidOn: fields.paidOn ?? parseDay(iraqToday()),
          receiptNo: await nextReceiptNo(tx)
        }
      });
    });

    return Response.json(
      { payment: formatSalaryPayment({ ...payment, month }) },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error.status) return errorResponse(error.message, error.status, { field: error.field });
    console.error("Salary payment POST error:", error);
    return errorResponse("حدث خطأ أثناء حفظ الدفعة.", 500);
  }
}
