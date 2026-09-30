
import { formatDate } from "../lib/arabic";
import { iraqToday } from "../lib/dates";
import { amountInWords } from "../lib/tafqeet";
import { PAYMENT_TYPES, classLabel, formatMoney, fullName, isSummerYear, parentName, yearLabel } from "../lib/labels";
import { REFUND_TYPES } from "../lib/finance";

const row = { display: "flex", gap: "8px", padding: "7px 0", borderBottom: "1px dotted #cbd5e1" };
const key = { minWidth: "130px", color: "#475569" };

// وصل قبض: one payment, laid out for printing on A5/A4.
// student is loadStudent()'s result; remaining is as of today.
// payment.enrollmentId, when given, may be an earlier school year («عن»
// that year): the receipt then shows that year and what is left of it.
export default function Receipt({ payment, student }) {
  const cls = student.enrollment?.class;
  const amount = Number(payment.amount);
  const payer = parentName(student.father) || "ولي أمر الطفل";
  // A refund prints as وصل صرف: the school pays the parent.
  const refund = REFUND_TYPES.includes(payment.paymentType);
  const tuition = !["CURRICULUM", "CURRICULUM_REFUND"].includes(payment.paymentType);

  const earlier = payment.enrollmentId && student.enrollment && payment.enrollmentId !== student.enrollment.id;
  const earlierDue = earlier && student.financial.previousDue.find((d) => d.enrollmentId === payment.enrollmentId);
  const yearName = earlier ? payment.yearName : student.enrollment?.academicYear?.name;
  const remaining = earlier ? earlierDue?.remaining ?? 0 : student.financial.remaining;

  return (
    <ReceiptFrame yearName={yearName} title={refund ? "وصل صرف" : "وصل قبض"} number={payment.receiptNo || "—"}>

      <section className="receipt-body" style={{ marginTop: "14px", fontSize: "16px" }}>
        <div className="receipt-row" style={row}>
          <span style={key}>التاريخ:</span>
          <strong>{formatDate(new Date(payment.paymentDate).toISOString())}</strong>
        </div>
        <div className="receipt-row" style={row}>
          <span style={key}>{refund ? "دفعنا إلى:" : "استلمنا من:"}</span>
          <strong>{payer}</strong>
        </div>
        <div className="receipt-row" style={row}>
          <span style={key}>مبلغاً وقدره:</span>
          <strong dir="ltr">{formatMoney(amount)} د.ع</strong>
        </div>
        <div className="receipt-row" style={row}>
          <span style={key}>المبلغ كتابةً:</span>
          <strong>{amountInWords(amount)}</strong>
        </div>
        <div className="receipt-row" style={row}>
          <span style={key}>وذلك عن:</span>
          <span>
            {PAYMENT_TYPES[payment.paymentType] || "قسط"}
            {payment.description ? ` — ${payment.description}` : ""}
          </span>
        </div>
        <div className="receipt-row" style={row}>
          <span style={key}>للطفل/ة:</span>
          <span>
            <strong>{fullName(student)}</strong> ({student.studentCode}){cls ? ` — ${classLabel(cls)}` : ""}
          </span>
        </div>
        {tuition && (
          <div className="receipt-row" style={row}>
            <span style={key}>المتبقي من الرسوم:</span>
            <span dir="ltr">
              {formatMoney(remaining)} د.ع
              <small style={{ color: "#64748b" }}> (حتى {formatDate(iraqToday())})</small>
            </span>
          </div>
        )}
        {!payment.receiptNo && (
          <p className="receipt-note" style={{ color: "#64748b", fontSize: "13px" }}>
            دفعة منقولة من سجل الروضة السابق، بدون رقم وصل.
          </p>
        )}
      </section>

      <footer className="receipt-footer" style={{ display: "flex", justifyContent: "space-between", marginTop: "40px", color: "#475569" }}>
        <span>توقيع المستلم: ....................</span>
        <span>الختم</span>
      </footer>

      {payment.voidedAt && (
        <div
          aria-label="وصل ملغى"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none"
          }}
        >
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
            {payment.voidReason && (
              <div style={{ fontSize: "16px" }}>{payment.voidReason}</div>
            )}
          </div>
        </div>
      )}
    </ReceiptFrame>
  );
}

// The receipt's border and letterhead, shared with the all-receipts statement.
export function ReceiptFrame({ yearName, title, number, children }) {
  return (
    <main
      className="receipt"
      style={{
        position: "relative",
        maxWidth: "720px",
        margin: "16px auto",
        padding: "28px 32px",
        backgroundColor: "#ffffff",
        border: "2px solid #1e40af",
        borderRadius: "12px",
        overflow: "hidden"
      }}
    >
      <header className="receipt-header" style={{ display: "flex", alignItems: "center", gap: "16px", borderBottom: "2px solid #1e40af", paddingBottom: "12px" }}>
        <img className="receipt-logo" src="/logo.png" alt="" width={84} height={84} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#1e40af" }}>مركز روبيك للتعليم المبكر</div>
          <div style={{ color: "#64748b" }}>
            {yearName && (isSummerYear(yearName)
              ? yearLabel(yearName)
              // dir="ltr": after Arabic text "2025-2026" would render as 2026-2025.
              : <>السنة الدراسية <span dir="ltr">{yearName}</span></>
            )}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "22px", fontWeight: 700 }}>{title}</div>
          <div dir="ltr" style={{ fontSize: "18px", color: "#b91c1c", fontWeight: 700 }}>
            {number}
          </div>
        </div>
      </header>

      {children}
    </main>
  );
}
