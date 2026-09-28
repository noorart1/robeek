
import { notFound } from "next/navigation";
import { requirePageUser } from "../../../../../lib/auth";
import { formatDate } from "../../../../../lib/arabic";
import { iraqToday } from "../../../../../lib/dates";
import { PAYMENT_METHODS, PAYMENT_TYPES, classLabel, formatMoney, fullName } from "../../../../../lib/labels";
import { loadStudent } from "../../../../../lib/student-data";
import AppHeader from "../../../../../components/AppHeader";
import PrintButton from "../../../../../components/PrintButton";
import { ReceiptFrame } from "../../../../../components/Receipt";
import { REFUND_TYPES } from "../../../../../lib/finance";

export const dynamic = "force-dynamic";

const cell = { padding: "5px 6px", borderBottom: "1px dotted #cbd5e1", textAlign: "right" };
const money = { ...cell, textAlign: "left", whiteSpace: "nowrap" };

// كشف الوصولات: every receipt of a child's current enrollment on one
// sheet, in the receipt's frame. Voided receipts are left out.
export default async function StudentReceiptsPage({ params }) {
  const user = await requirePageUser(["ADMIN"]);
  const { id } = await params;
  const studentId = Number(id);

  const student = Number.isSafeInteger(studentId) && studentId > 0
    ? await loadStudent(studentId)
    : null;

  if (!student) notFound();

  const payments = (student.enrollment?.payments || []).filter((p) => !p.voidedAt);
  const cls = student.enrollment?.class;
  const { tuitionFee, totalPaid, remaining, curriculumPaid } = student.financial;
  // As in the child's dialog: a child who has left owes nothing more.
  const active = student.status === "ACTIVE";

  const totals = [
    ["المبلغ الإجمالي", tuitionFee],
    ["الواصل", totalPaid],
    ...(active ? [["الباقي", remaining]] : []),
    ...(curriculumPaid ? [["المنهج والزي", curriculumPaid]] : [])
  ];

  return (
    <>
      <div className="no-print">
        <AppHeader user={user} active="" />
        <div style={{ maxWidth: "720px", margin: "16px auto 0", padding: "0 20px", display: "flex", gap: "10px", alignItems: "center" }}>
          <PrintButton />
          <span style={{ color: "#64748b" }}>كل الوصولات في ورقة واحدة، بدون الوصولات الملغاة.</span>
        </div>
      </div>

      <ReceiptFrame yearName={student.enrollment?.academicYear?.name} title="كشف الوصولات" number={student.studentCode}>
        <section className="receipt-body" style={{ marginTop: "14px", fontSize: "15px" }}>
          <p style={{ margin: "0 0 8px" }}>
            للطفل/ة: <strong>{fullName(student)}</strong>{cls ? ` — ${classLabel(cls)}` : ""}
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
                  <th style={cell}>النوع</th>
                  <th style={cell}>نوع الدفع</th>
                  <th style={money}>المبلغ</th>
                  <th style={cell}>الفترة / ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td style={cell} dir="ltr">{payment.receiptNo || "—"}</td>
                    <td style={cell}>{formatDate(new Date(payment.paymentDate).toISOString())}</td>
                    <td style={cell}>{PAYMENT_TYPES[payment.paymentType] || "قسط"}</td>
                    <td style={cell}>{PAYMENT_METHODS[payment.paymentMethod] || "—"}</td>
                    <td style={money} dir="ltr">
                      {REFUND_TYPES.includes(payment.paymentType) ? "−" : ""}{formatMoney(payment.amount)}
                    </td>
                    <td style={cell}>{payment.description || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", marginTop: "10px" }}>
            {totals.map(([label, value]) => (
              <span key={label}>
                {label}: <strong dir="ltr">{formatMoney(value)} د.ع</strong>
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
