
import Link from "next/link";
import prisma from "../../../../lib/prisma";
import { requirePageUser } from "../../../../lib/auth";
import { formatDate } from "../../../../lib/arabic";
import { iraqToday } from "../../../../lib/dates";
import { PAYMENT_PLANS, SHIFTS, classLabel, formatMoney, fullName } from "../../../../lib/labels";
import { formatStudent, studentSelect } from "../../../../lib/student-data";
import AppHeader from "../../../../components/AppHeader";

export const dynamic = "force-dynamic";

// 07XXXXXXXXX → 9647XXXXXXXXX, the international form wa.me needs.
function whatsappNumber(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (/^07\d{9}$/.test(digits)) return "964" + digits.slice(1);
  if (/^9647\d{9}$/.test(digits)) return digits;
  return null;
}

function reminder(student) {
  const cls = student.enrollment?.class;
  return (
    `السلام عليكم،\n` +
    `نود تذكيركم بأن قسط الطفل/ة ${fullName(student)}` +
    `${cls ? ` (${classLabel(cls)})` : ""} في مركز روبيك للتعليم المبكر ` +
    `متأخر بمبلغ ${formatMoney(student.financial.overdue)} دينار عراقي.\n` +
    `يرجى تسديده في أقرب وقت. شكراً لتعاونكم.`
  );
}

function WhatsAppLink({ phone, label, student }) {
  const number = whatsappNumber(phone);

  if (!number) return null;

  return (
    <a
      href={`https://wa.me/${number}?text=${encodeURIComponent(reminder(student))}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`واتساب ${label}: ${phone}`}
      style={{
        display: "inline-block",
        padding: "5px 10px",
        borderRadius: "6px",
        backgroundColor: "#dcfce7",
        color: "#15803d",
        textDecoration: "none",
        whiteSpace: "nowrap"
      }}
    >
      واتساب {label}
    </a>
  );
}

const cell = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "right", whiteSpace: "nowrap" };
const money = { ...cell, textAlign: "left", fontVariantNumeric: "tabular-nums" };

// المتأخرون عن الدفع: children whose paid tuition is below what their
// instalment plan says was due by today (lib/dues.js).
export default async function OverduePage({ searchParams }) {
  const user = await requirePageUser(["ADMIN"]);
  const { shift = "" } = await searchParams;

  const students = (
    await prisma.student.findMany({
      where: { status: "ACTIVE" },
      select: studentSelect
    })
  )
    .map(formatStudent)
    .filter((s) => s.financial.overdue > 0)
    .filter((s) => !shift || s.enrollment?.class?.shift === shift)
    .sort((a, b) => b.financial.overdue - a.financial.overdue);

  const total = students.reduce((sum, s) => sum + s.financial.overdue, 0);

  const tab = (value, label) => (
    <Link
      key={value || "all"}
      href={value ? `?shift=${value}` : "?"}
      style={{
        padding: "7px 14px",
        borderRadius: "8px",
        textDecoration: "none",
        backgroundColor: shift === value ? "#2563eb" : "#ffffff",
        color: shift === value ? "#ffffff" : "#1e293b",
        border: "1px solid #cbd5e1"
      }}
    >
      {label}
    </Link>
  );

  return (
    <>
      <AppHeader user={user} active="/dashboard/finance" />

      <main style={{ maxWidth: "1200px", margin: "24px auto", padding: "0 20px" }}>
        <p style={{ margin: 0 }}>
          <Link href="/dashboard/finance" style={{ color: "#2563eb" }}>→ المالية</Link>
        </p>
        <h1 style={{ color: "#1e40af", marginBottom: "4px" }}>المتأخرون عن الدفع</h1>
        <p style={{ color: "#64748b", marginTop: 0 }}>
          حتى {formatDate(iraqToday())}: {students.length} أطفال، مجموع المتأخر{" "}
          <strong style={{ color: "#b91c1c" }}>{formatMoney(total)} د.ع</strong>. المستحق يُحسب من
          الأقساط: الشهري على أشهر السنة حتى أيار، والسنوي على دفعتين.
        </p>

        <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
          {tab("", "الكل")}
          {Object.entries(SHIFTS).map(([value, label]) => tab(value, label))}
        </div>

        <div style={{ backgroundColor: "#ffffff", borderRadius: "12px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#eff6ff", color: "#1e40af" }}>
                <th style={cell}>ت</th>
                <th style={cell}>الطفل</th>
                <th style={cell}>الشعبة</th>
                <th style={cell}>طريقة الدفع</th>
                <th style={{ ...cell, textAlign: "left" }}>المستحق حتى اليوم</th>
                <th style={{ ...cell, textAlign: "left" }}>الواصل</th>
                <th style={{ ...cell, textAlign: "left" }}>المتأخر</th>
                <th style={cell}>القسط القادم</th>
                <th style={cell}>تذكير</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s, index) => (
                <tr key={s.id}>
                  <td style={{ ...cell, color: "#94a3b8" }}>{index + 1}</td>
                  <td style={{ ...cell, fontWeight: 600 }}>
                    {fullName(s)} <small style={{ color: "#94a3b8" }}>{s.studentCode}</small>
                  </td>
                  <td style={cell}>{classLabel(s.enrollment?.class)}</td>
                  <td style={cell}>
                    {PAYMENT_PLANS[s.enrollment?.paymentPlan] || (
                      <span style={{ color: "#b45309" }} title="غير محددة؛ حُسبت كشهري">شهري؟</span>
                    )}
                  </td>
                  <td style={money}>{formatMoney(s.financial.expected)}</td>
                  <td style={{ ...money, color: "#15803d" }}>{formatMoney(s.financial.totalPaid)}</td>
                  <td style={{ ...money, color: "#b91c1c", fontWeight: 700 }}>{formatMoney(s.financial.overdue)}</td>
                  <td style={cell}>
                    {s.financial.nextDue
                      ? `${formatDate(s.financial.nextDue.day)} — ${formatMoney(s.financial.nextDue.amount)}`
                      : "—"}
                  </td>
                  <td style={{ ...cell, display: "flex", gap: "4px" }}>
                    <WhatsAppLink phone={s.father?.phone} label="الأب" student={s} />
                    <WhatsAppLink phone={s.mother?.phone} label="الأم" student={s} />
                  </td>
                </tr>
              ))}
            </tbody>
            {students.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, backgroundColor: "#f8fafc" }}>
                  <td style={cell} colSpan={6}>المجموع</td>
                  <td style={{ ...money, color: "#b91c1c" }}>{formatMoney(total)}</td>
                  <td style={cell} colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
          {students.length === 0 && (
            <p style={{ padding: "16px", color: "#15803d" }}>✓ لا يوجد متأخرون.</p>
          )}
        </div>
      </main>
    </>
  );
}
