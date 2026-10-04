import { notFound, redirect } from "next/navigation";
import prisma from "../../../../../lib/prisma";
import { requirePageUser } from "../../../../../lib/auth";
import { canFinance } from "../../../../../lib/finance-access";
import { formatDate } from "../../../../../lib/arabic";
import { amountInWords } from "../../../../../lib/tafqeet";
import { PAYMENT_METHODS, formatMoney } from "../../../../../lib/labels";
import { formatSalary, formatSalaryPayment } from "../../../../../lib/staff";
import AppHeader from "../../../../../components/AppHeader";
import PrintButton from "../../../../../components/PrintButton";
import { ReceiptFrame } from "../../../../../components/Receipt";

export const dynamic = "force-dynamic";

const row = { display: "flex", gap: "8px", padding: "7px 0", borderBottom: "1px dotted #cbd5e1" };
const key = { minWidth: "130px", color: "#475569" };

// وصل صرف راتب: one salary payment, in the child's receipt frame. A
// refund (استرجاع) is money the person gave back: it prints as وصل قبض.
export default async function SalaryReceiptPage({ params }) {
  const user = await requirePageUser(["ADMIN", "DEPUTY"]);
  // A معاون: only with «رواتب الموظفين» in المالية.
  if (!canFinance(user, "salaries")) redirect("/dashboard/finance");
  const { id } = await params;
  const paymentId = Number(id);

  const record = Number.isSafeInteger(paymentId) && paymentId > 0
    ? await prisma.salaryPayment.findUnique({
        where: { id: paymentId },
        include: { Salary: { include: { Staff: true, SalaryPayment: true } } }
      })
    : null;

  if (!record) notFound();

  const payment = formatSalaryPayment(record);
  const { Staff: person, ...rest } = record.Salary;
  const salary = formatSalary(rest);
  const refund = payment.paymentType === "REFUND";
  const bonus = payment.paymentType === "BONUS";

  return (
    <>
      <div className="no-print">
        <AppHeader user={user} active="" />
        <div style={{ maxWidth: "720px", margin: "16px auto 0", padding: "0 20px", display: "flex", gap: "10px", alignItems: "center" }}>
          <PrintButton />
          <span style={{ color: "#64748b" }}>
            {payment.voidedAt ? "هذا الوصل ملغى." : "يُطبع الوصل وحده، بدون القوائم."}
          </span>
        </div>
      </div>

      <ReceiptFrame title={refund ? "وصل قبض" : bonus ? "وصل صرف مكافأة" : "وصل صرف راتب"} number={payment.receiptNo || "—"}>
        <section className="receipt-body" style={{ marginTop: "14px", fontSize: "16px" }}>
          <div className="receipt-row" style={row}>
            <span style={key}>التاريخ:</span>
            <strong>{formatDate(payment.paidOn) || "—"}</strong>
          </div>
          <div className="receipt-row" style={row}>
            <span style={key}>{refund ? "استلمنا من:" : "دفعنا إلى:"}</span>
            <strong>{person.name}</strong>
            {person.job && <span style={{ color: "#64748b" }}>— {person.job}</span>}
          </div>
          <div className="receipt-row" style={row}>
            <span style={key}>مبلغاً وقدره:</span>
            <strong dir="ltr">{formatMoney(payment.amount)} د.ع</strong>
          </div>
          <div className="receipt-row" style={row}>
            <span style={key}>المبلغ كتابةً:</span>
            <strong>{amountInWords(payment.amount)}</strong>
          </div>
          <div className="receipt-row" style={row}>
            <span style={key}>وذلك عن:</span>
            <span>
              {refund ? "استرجاع من راتب شهر" : bonus ? "مكافأة شهر" : "راتب شهر"} <span dir="ltr">{salary.month}</span>
              {payment.description ? ` — ${payment.description}` : ""}
            </span>
          </div>
          <div className="receipt-row" style={row}>
            <span style={key}>نوع الدفع:</span>
            <span>{PAYMENT_METHODS[payment.paymentMethod] || "—"}</span>
          </div>
          <div className="receipt-row" style={row}>
            <span style={key}>المتبقي من الشهر:</span>
            <span dir="ltr">
              {formatMoney(salary.remaining)} د.ع
              <small style={{ color: "#64748b" }}> (من صافي {formatMoney(salary.net)})</small>
            </span>
          </div>
          {!payment.receiptNo && (
            <p className="receipt-note" style={{ color: "#64748b", fontSize: "13px" }}>
              دفعة منقولة من سجل الرواتب السابق، بدون رقم وصل.
            </p>
          )}
        </section>

        <footer className="receipt-footer" style={{ display: "flex", justifyContent: "space-between", marginTop: "40px", color: "#475569" }}>
          <span>توقيع المستلم: ....................</span>
          <span>الختم</span>
        </footer>

        {payment.voidedAt && (
          <div aria-label="وصل ملغى" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div
              style={{
                transform: "rotate(-20deg)",
                border: "6px solid #dc2626",
                color: "#dc2626",
                fontSize: "64px",
                fontWeight: 700,
                padding: "4px 36px",
                borderRadius: "12px",
                opacity: 0.75,
                backgroundColor: "rgba(255,255,255,0.6)",
                textAlign: "center"
              }}
            >
              ملغى
              {payment.voidReason && <div style={{ fontSize: "16px" }}>{payment.voidReason}</div>}
            </div>
          </div>
        )}
      </ReceiptFrame>
    </>
  );
}
