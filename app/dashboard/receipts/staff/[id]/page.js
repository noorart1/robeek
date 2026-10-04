import { notFound, redirect } from "next/navigation";
import prisma from "../../../../../lib/prisma";
import { requirePageUser } from "../../../../../lib/auth";
import { canFinance } from "../../../../../lib/finance-access";
import { formatDate } from "../../../../../lib/arabic";
import { iraqToday } from "../../../../../lib/dates";
import { PAYMENT_METHODS, SALARY_PAYMENT_TYPES, formatMoney } from "../../../../../lib/labels";
import { formatSalary, formatSalaryPayment } from "../../../../../lib/staff";
import AppHeader from "../../../../../components/AppHeader";
import PrintButton from "../../../../../components/PrintButton";
import { ReceiptFrame } from "../../../../../components/Receipt";

export const dynamic = "force-dynamic";

const cell = { padding: "5px 6px", borderBottom: "1px dotted #cbd5e1", textAlign: "right" };
const money = { ...cell, textAlign: "left", whiteSpace: "nowrap" };

// كشف وصولات الرواتب: every salary payment to one person on one sheet,
// like a child's كشف الوصولات. Voided receipts are left out.
export default async function StaffSalariesPage({ params }) {
  const user = await requirePageUser(["ADMIN", "DEPUTY"]);
  // A معاون: only with «رواتب الموظفين» in المالية.
  if (!canFinance(user, "salaries")) redirect("/dashboard/finance");
  const { id } = await params;
  const staffId = Number(id);

  const person = Number.isSafeInteger(staffId) && staffId > 0
    ? await prisma.staff.findUnique({
        where: { id: staffId },
        include: { Salary: { orderBy: { month: "asc" }, include: { SalaryPayment: { orderBy: { id: "asc" } } } } }
      })
    : null;

  if (!person) notFound();

  const salaries = person.Salary.map(formatSalary);
  const payments = person.Salary.flatMap((s) =>
    s.SalaryPayment.filter((p) => !p.voidedAt).map((p) => formatSalaryPayment({ ...p, month: s.month }))
  );
  const sum = (field) => salaries.reduce((total, s) => total + s[field], 0);

  return (
    <>
      <div className="no-print">
        <AppHeader user={user} active="" />
        <div style={{ maxWidth: "720px", margin: "16px auto 0", padding: "0 20px", display: "flex", gap: "10px", alignItems: "center" }}>
          <PrintButton />
          <span style={{ color: "#64748b" }}>كل الوصولات في ورقة واحدة، بدون الوصولات الملغاة.</span>
        </div>
      </div>

      <ReceiptFrame title="كشف الرواتب" number={`${payments.length} وصل`}>
        <section className="receipt-body" style={{ marginTop: "14px", fontSize: "15px" }}>
          <p style={{ margin: "0 0 8px" }}>
            للموظف/ة: <strong>{person.name}</strong>{person.job ? ` — ${person.job}` : ""}
            <span style={{ color: "#64748b" }}> — حتى {formatDate(iraqToday())}</span>
          </p>

          {payments.length === 0 ? (
            <p style={{ color: "#64748b" }}>لا توجد وصولات.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "#475569" }}>
                  <th style={cell}>الوصل</th>
                  <th style={cell}>التاريخ</th>
                  <th style={cell}>عن شهر</th>
                  <th style={cell}>النوع</th>
                  <th style={cell}>نوع الدفع</th>
                  <th style={money}>المبلغ</th>
                  <th style={cell}>ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td style={cell} dir="ltr">{p.receiptNo || "—"}</td>
                    <td style={cell}>{formatDate(p.paidOn) || "—"}</td>
                    <td style={cell} dir="ltr">{p.month}</td>
                    <td style={cell}>{SALARY_PAYMENT_TYPES[p.paymentType]}</td>
                    <td style={cell}>{PAYMENT_METHODS[p.paymentMethod] || "—"}</td>
                    <td style={money} dir="ltr">{p.paymentType === "REFUND" ? "−" : ""}{formatMoney(p.amount)}</td>
                    <td style={cell}>{p.description || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", marginTop: "10px" }}>
            {[["المستحق", "net"], ["المدفوع", "paid"], ["الباقي", "remaining"]].map(([label, field]) => (
              <span key={field}>
                {label}: <strong dir="ltr">{formatMoney(sum(field))} د.ع</strong>
              </span>
            ))}
          </div>
        </section>

        <footer className="receipt-footer" style={{ display: "flex", justifyContent: "space-between", marginTop: "40px", color: "#475569" }}>
          <span>توقيع المستلم: ....................</span>
          <span>الختم</span>
        </footer>
      </ReceiptFrame>
    </>
  );
}
