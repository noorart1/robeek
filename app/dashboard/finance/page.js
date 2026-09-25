
import prisma from "../../../lib/prisma";
import { requirePageUser } from "../../../lib/auth";
import { SHIFTS, classLabel, formatMoney } from "../../../lib/labels";
import { activeAcademicYear } from "../../../lib/student-data";
import AppHeader from "../../../components/AppHeader";

export const dynamic = "force-dynamic";

const cell = {
  padding: "10px 12px",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "right",
  whiteSpace: "nowrap"
};

const money = { ...cell, textAlign: "left", fontVariantNumeric: "tabular-nums" };

function emptyTotals() {
  return { students: 0, fee: 0, paid: 0, curriculum: 0 };
}

function add(totals, enrollment) {
  totals.students += 1;
  totals.fee += Number(enrollment.tuitionFee);

  for (const payment of enrollment.Payment) {
    if (payment.paymentType === "CURRICULUM") {
      totals.curriculum += Number(payment.amount);
    } else {
      totals.paid += Number(payment.amount);
    }
  }
}

function Row({ label, totals, strong }) {
  const style = strong ? { fontWeight: "bold", backgroundColor: "#f8fafc" } : undefined;
  const remaining = totals.fee - totals.paid;

  return (
    <tr style={style}>
      <td style={cell}>{label}</td>
      <td style={{ ...cell, textAlign: "center" }}>{totals.students}</td>
      <td style={money}>{formatMoney(totals.fee)}</td>
      <td style={{ ...money, color: "#15803d" }}>{formatMoney(totals.paid)}</td>
      <td style={{ ...money, color: remaining > 0 ? "#b91c1c" : undefined }}>
        {formatMoney(remaining)}
      </td>
      <td style={money}>{formatMoney(totals.curriculum)}</td>
    </tr>
  );
}

export default async function FinancePage() {
  const user = await requirePageUser(["ADMIN"]);

  const year = await activeAcademicYear();

  const enrollments = year
    ? await prisma.enrollment.findMany({
        where: { academicYearId: year.id },
        select: {
          tuitionFee: true,
          Class: { select: { id: true, name: true, shift: true } },
          Student: { select: { status: true } },
          Payment: { select: { amount: true, paymentType: true } }
        }
      })
    : [];

  const byShift = {};
  const byClass = new Map();
  const inactive = emptyTotals();
  const grand = emptyTotals();

  for (const enrollment of enrollments) {
    add(grand, enrollment);

    // Like the workbook's الغاء التسجيل row: money from children who have
    // left is shown separately rather than hidden.
    if (enrollment.Student.status !== "ACTIVE") {
      add(inactive, enrollment);
      continue;
    }

    const { Class: cls } = enrollment;
    add((byShift[cls.shift] ??= emptyTotals()), enrollment);

    if (!byClass.has(cls.id)) byClass.set(cls.id, { cls, totals: emptyTotals() });
    add(byClass.get(cls.id).totals, enrollment);
  }

  const classRows = [...byClass.values()].sort(
    (a, b) =>
      (a.cls.shift === b.cls.shift ? 0 : a.cls.shift === "MORNING" ? -1 : 1) ||
      a.cls.name.localeCompare(b.cls.name)
  );

  const head = (
    <thead>
      <tr style={{ backgroundColor: "#eff6ff", color: "#1e40af" }}>
        {["", "عدد الأطفال", "المبلغ الإجمالي", "الواصل", "الباقي", "المنهج"].map((h) => (
          <th key={h} style={{ ...cell, textAlign: h && h !== "عدد الأطفال" ? "left" : "right" }}>{h}</th>
        ))}
      </tr>
    </thead>
  );

  const box = {
    overflowX: "auto",
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    marginBottom: "20px"
  };

  return (
    <>
      <AppHeader user={user} active="/dashboard/finance" />

      <main style={{ maxWidth: "1000px", margin: "24px auto", padding: "0 20px" }}>
        <h1 style={{ color: "#1e40af", marginBottom: "4px" }}>
          الملف المالي والأرصدة
        </h1>
        <p style={{ color: "#64748b", marginTop: 0 }}>
          {year ? `السنة الدراسية ${year.name}` : "لا توجد سنة دراسية نشطة"} — المبالغ بالدينار العراقي
        </p>

        <div style={box}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            {head}
            <tbody>
              {Object.entries(SHIFTS).map(([shift, label]) => (
                <Row
                  key={shift}
                  label={shift === "MORNING" ? "الصباحية" : "المسائية"}
                  totals={byShift[shift] || emptyTotals()}
                />
              ))}
              {inactive.students > 0 && <Row label="الغاء التسجيل" totals={inactive} />}
              <Row label="المجموع" totals={grand} strong />
            </tbody>
          </table>
        </div>

        <h2 style={{ fontSize: "18px", color: "#1e40af" }}>حسب الشعبة</h2>

        <div style={box}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            {head}
            <tbody>
              {classRows.map(({ cls, totals }) => (
                <Row key={cls.id} label={classLabel(cls)} totals={totals} />
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
