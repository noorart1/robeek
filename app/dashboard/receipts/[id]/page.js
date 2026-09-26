
import { notFound } from "next/navigation";
import prisma from "../../../../lib/prisma";
import { requirePageUser } from "../../../../lib/auth";
import { formatDate } from "../../../../lib/arabic";
import { iraqToday } from "../../../../lib/dates";
import { amountInWords } from "../../../../lib/tafqeet";
import { PAYMENT_TYPES, classLabel, formatMoney, fullName, parentName } from "../../../../lib/labels";
import { loadStudent } from "../../../../lib/student-data";
import AppHeader from "../../../../components/AppHeader";
import PrintButton from "../../../../components/PrintButton";

export const dynamic = "force-dynamic";

const row = { display: "flex", gap: "8px", padding: "7px 0", borderBottom: "1px dotted #cbd5e1" };
const key = { minWidth: "130px", color: "#475569" };

// وصل قبض: one payment, laid out for printing on A5/A4.
export default async function ReceiptPage({ params }) {
  const user = await requirePageUser(["ADMIN"]);
  const { id } = await params;
  const paymentId = Number(id);

  const payment = Number.isSafeInteger(paymentId) && paymentId > 0
    ? await prisma.payment.findUnique({
        where: { id: paymentId },
        include: { Enrollment: { select: { studentId: true } } }
      })
    : null;

  if (!payment) notFound();

  const student = await loadStudent(payment.Enrollment.studentId);
  const cls = student.enrollment?.class;
  const amount = Number(payment.amount);
  const payer = parentName(student.father) || "ولي أمر الطفل";

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
              {student.enrollment?.academicYear?.name && (
                // dir="ltr": after Arabic text "2025-2026" would render as 2026-2025.
                <>السنة الدراسية <span dir="ltr">{student.enrollment.academicYear.name}</span></>
              )}
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "22px", fontWeight: 700 }}>وصل قبض</div>
            <div dir="ltr" style={{ fontSize: "18px", color: "#b91c1c", fontWeight: 700 }}>
              {payment.receiptNo || "—"}
            </div>
          </div>
        </header>

        <section className="receipt-body" style={{ marginTop: "14px", fontSize: "16px" }}>
          <div className="receipt-row" style={row}>
            <span style={key}>التاريخ:</span>
            <strong>{formatDate(payment.paymentDate.toISOString())}</strong>
          </div>
          <div className="receipt-row" style={row}>
            <span style={key}>استلمنا من:</span>
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
          {payment.paymentType !== "CURRICULUM" && (
            <div className="receipt-row" style={row}>
              <span style={key}>المتبقي من الرسوم:</span>
              <span dir="ltr">
                {formatMoney(student.financial.remaining)} د.ع
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
      </main>
    </>
  );
}
