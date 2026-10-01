
import prisma from "../../../lib/prisma";
import { requirePageUser } from "../../../lib/auth";
import { SHIFTS, classLabel, formatMoney, summerYearName, yearLabel } from "../../../lib/labels";
import { formatStudent, overdueViews, studentSelect } from "../../../lib/student-data";
import { PARTNERS, monthlySummary, paidTotals, yearMonths } from "../../../lib/finance";
import { matchesSearch } from "../../../lib/arabic";
import { salaryAmount } from "../../../lib/staff";
import { iraqToday } from "../../../lib/dates";
import Link from "next/link";
import AppHeader from "../../../components/AppHeader";
import SalariesBoard from "../../../components/SalariesBoard";
import ExpensesBoard from "../../../components/ExpensesBoard";

export const dynamic = "force-dynamic";

const dayMonth = (date) => new Date(date).toISOString().slice(0, 7);

// Each tab holds only its own ledger: the two expense tabs, and the box
// tab with الصندوق, حصص الشركاء and the money moving in and out of them.
const TABS = {
  summary: "الملخص",
  salaries: "رواتب الموظفين",
  general: "مصاريف عامة",
  fixed: "مصاريف ثابتة",
  box: "الصندوق والشركاء"
};
const BOARD = { general: "GENERAL", fixed: "ASSET" };

// The chosen school year and month (?year, ?month) go with every tab.
const keep = (params) => ({
  ...(params.year && { year: params.year }),
  ...(params.month && { month: params.month })
});

function Tabs({ tab, params }) {
  return (
    <nav style={{ display: "flex", gap: "6px", marginBottom: "16px", borderBottom: "1px solid #e2e8f0" }}>
      {Object.entries(TABS).map(([key, label]) => (
        <Link
          key={key}
          href={`/dashboard/finance?${new URLSearchParams({ ...(key !== "summary" && { tab: key }), ...keep(params) })}`}
          aria-current={tab === key ? "page" : undefined}
          style={{
            padding: "8px 16px",
            textDecoration: "none",
            color: tab === key ? "#1e40af" : "#64748b",
            fontWeight: tab === key ? 700 : 400,
            borderBottom: tab === key ? "3px solid #2563eb" : "3px solid transparent"
          }}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

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

  const paid = paidTotals(enrollment.Payment);
  totals.paid += paid.tuition;
  totals.curriculum += paid.curriculum;
}

// remaining: null hides it (children who have left owe nothing more).
function Row({ label, totals, strong, remaining = totals.fee - totals.paid }) {
  const style = strong ? { fontWeight: "bold", backgroundColor: "#f8fafc" } : undefined;

  return (
    <tr style={style}>
      <td style={cell}>{label}</td>
      <td style={{ ...cell, textAlign: "center" }}>{totals.students}</td>
      <td style={money}>{formatMoney(totals.fee)}</td>
      <td style={{ ...money, color: "#15803d" }}>{formatMoney(totals.paid)}</td>
      <td style={{ ...money, color: remaining > 0 ? "#b91c1c" : undefined }}>
        {remaining === null ? "—" : formatMoney(remaining)}
      </td>
      <td style={money}>{formatMoney(totals.curriculum)}</td>
    </tr>
  );
}

export default async function FinancePage({ searchParams }) {
  const user = await requirePageUser(["ADMIN"]);
  const params = await searchParams;
  // ?tab=expenses was the one ledger tab before it was split.
  const tab = params.tab === "expenses" ? "general" : params.tab in TABS ? params.tab : "summary";

  if (tab === "salaries" || tab in BOARD) {
    return (
      <>
        <AppHeader user={user} active="/dashboard/finance" />
        <main style={{ maxWidth: "1440px", margin: "24px auto", padding: "0 20px" }}>
          <h1 style={{ color: "#1e40af", marginBottom: "12px" }}>الملف المالي والأرصدة</h1>
          <Tabs tab={tab} params={params} />
          {tab === "salaries" ? <SalariesBoard /> : <ExpensesBoard key={tab} kind={BOARD[tab]} />}
        </main>
      </>
    );
  }

  // ?year=<id> shows an earlier school year; the active one by default.
  // School years only: a summer course belongs to the year it ends.
  const years = await prisma.academicYear.findMany({ where: { kind: "REGULAR" }, orderBy: { name: "desc" } });
  const active = years.find((y) => y.isActive) ?? null;
  const year = years.find((y) => String(y.id) === params.year) ?? active;
  const isActiveYear = year?.id === active?.id;
  // The active year runs on until the next one is started.
  const yearRange = yearMonths(year?.name);
  const thisMonth = iraqToday().slice(0, 7);
  const range = yearRange && isActiveYear && thisMonth > yearRange.to ? { ...yearRange, to: thisMonth } : yearRange;

  // الملخص الشهري: the months of the chosen school year (September to
  // August), or every month when the year's name has no dates in it.
  const [allPayments, allSalaries, allExpenses] = await Promise.all([
    prisma.payment.findMany({
      where: { voidedAt: null },
      select: { amount: true, paymentType: true, paymentMethod: true, paymentDate: true }
    }),
    // Salaries as paid (voided receipts never count), in the month they were
    // paid, so الصندوق follows the cash. Imported payments have no date:
    // they stay under the salary's own month.
    prisma.salaryPayment.findMany({
      where: { voidedAt: null },
      select: { amount: true, paymentType: true, paidOn: true, Salary: { select: { month: true } } }
    }),
    prisma.expense.findMany({ select: { date: true, category: true, amount: true, item: true } })
  ]);
  const months = monthlySummary({
    payments: allPayments,
    salaries: allSalaries.map((p) => ({ month: p.paidOn ? dayMonth(p.paidOn) : p.Salary.month, net: salaryAmount(p) })),
    expenses: allExpenses
  }).filter((m) => !range || (m.month >= range.from && m.month <= range.to));
  const showUnknown = months.some((m) => m.unknown);
  const monthColumns = [
    ["cash", "وارد نقدي"],
    ["card", "وارد بطاقة"],
    ...(showUnknown ? [["unknown", "وارد (غير محدد)"]] : []),
    ["otherIncome", "وارد آخر"],
    ["refunds", "استرجاع"],
    ["salaries", "رواتب الموظفين"],
    ["expenses", "مصاريف عامة"],
    ["assets", "مصاريف ثابتة"],
    ["net", "الصافي"],
    ["handovers", "تسليم الإدارة"],
    ["withdrawals", "سحب الشركاء"]
  ];
  const monthTotal = (key) => months.reduce((sum, m) => sum + m[key], 0);

  // الصندوق وحصص الشركاء, as the workbook's «الرئيسية» worked them out:
  // what is not handed to the management stays in the centre's box; the
  // management's box is what it received less the partners' draws; each
  // partner is due their share of the net and has drawn so much.
  const net = monthTotal("net");
  const handovers = monthTotal("handovers");
  // Of which hand-entered before تسليم الإدارة came from the receipts.
  const manualHandovers = allExpenses
    .filter((e) => e.category === "HANDOVER" && (!range || (dayMonth(e.date) >= range.from && dayMonth(e.date) <= range.to)))
    .reduce((t, e) => t + Number(e.amount), 0);
  const withdrawals = monthTotal("withdrawals");
  const draws = allExpenses.filter(
    (e) => e.category === "WITHDRAWAL" &&
      (!range || (dayMonth(e.date) >= range.from && dayMonth(e.date) <= range.to))
  );
  const partners = PARTNERS.map((p) => {
    const taken = draws.filter((e) => matchesSearch(e.item, p.name)).reduce((t, e) => t + Number(e.amount), 0);
    return { ...p, due: net * p.share, taken, left: net * p.share - taken };
  });
  const unassigned = withdrawals - partners.reduce((t, p) => t + p.taken, 0);

  const enrollmentSelect = {
    tuitionFee: true,
    Class: { select: { id: true, name: true, shift: true } },
    Student: { select: { status: true } },
    // Voided receipts never count.
    Payment: { where: { voidedAt: null }, select: { amount: true, paymentType: true } }
  };
  // The summer course that closes this year: «صيف 2026» for 2025-2026.
  const summerName = year && /^\d{4}-(\d{4})$/.test(year.name) ? summerYearName(year.name.slice(5)) : null;
  const [enrollments, summerEnrollments] = await Promise.all([
    year ? prisma.enrollment.findMany({ where: { academicYearId: year.id }, select: enrollmentSelect }) : [],
    summerName ? prisma.enrollment.findMany({ where: { AcademicYear: { name: summerName } }, select: enrollmentSelect }) : []
  ]);
  const summerTotals = emptyTotals();
  for (const enrollment of summerEnrollments) add(summerTotals, enrollment);

  // Overdue is about today, so only for the active year.
  const overdue = (
    isActiveYear ? await prisma.student.findMany({ where: { status: "ACTIVE" }, select: studentSelect }) : []
  )
    .map(formatStudent)
    .flatMap(overdueViews);
  const overdueTotal = overdue.reduce((sum, s) => sum + s.financial.overdue, 0);

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

      <main style={{ maxWidth: "1200px", margin: "24px auto", padding: "0 20px" }}>
        <h1 style={{ color: "#1e40af", marginBottom: "4px" }}>
          الملف المالي والأرصدة
        </h1>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", color: "#64748b", marginBottom: "12px" }}>
          السنة الدراسية:
          {years.map((y) => (
            <Link
              key={y.id}
              href={`/dashboard/finance?${new URLSearchParams({ ...(tab === "box" && { tab }), ...(!y.isActive && { year: y.id }), ...(params.month && { month: params.month }) })}`}
              aria-current={y.id === year?.id ? "page" : undefined}
              dir="ltr"
              style={{
                padding: "4px 10px",
                borderRadius: "6px",
                textDecoration: "none",
                color: y.id === year?.id ? "#ffffff" : "#1e40af",
                backgroundColor: y.id === year?.id ? "#2563eb" : "#eff6ff"
              }}
            >
              {y.name}{y.isActive ? " (الحالية)" : ""}
            </Link>
          ))}
          {!years.length && "لا توجد سنة دراسية"}
          <span style={{ marginInlineStart: "auto" }}>المبالغ بالدينار العراقي</span>
        </div>

        <Tabs tab={tab} params={params} />

        {tab === "summary" && (<>
        {isActiveYear && (
        <Link
          href="/dashboard/finance/overdue"
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            padding: "14px 18px",
            marginBottom: "16px",
            borderRadius: "12px",
            textDecoration: "none",
            backgroundColor: overdue.length ? "#fef2f2" : "#f0fdf4",
            color: overdue.length ? "#b91c1c" : "#15803d"
          }}
        >
          <strong>المتأخرون عن الدفع:</strong>
          {overdue.length
            ? `${new Set(overdue.map((s) => s.id)).size} أطفال — ${formatMoney(overdueTotal)} د.ع`
            : "لا يوجد"}
          <span style={{ marginInlineStart: "auto" }}>عرض القائمة وتذكير الأهل ←</span>
        </Link>
        )}

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
              {inactive.students > 0 && <Row label="الغاء التسجيل" totals={inactive} remaining={null} />}
              <Row
                label="المجموع"
                totals={grand}
                remaining={grand.fee - grand.paid - (inactive.fee - inactive.paid)}
                strong
              />
              {summerTotals.students > 0 && <Row label={yearLabel(summerName)} totals={summerTotals} />}
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

        <h2 style={{ fontSize: "18px", color: "#1e40af", marginBottom: "4px" }}>الملخص الشهري</h2>
        <p style={{ color: "#64748b", marginTop: 0, fontSize: "13px" }}>
          {range && <>من <span dir="ltr">{range.from}</span> إلى <span dir="ltr">{range.to}</span>. </>}
          الوارد حسب تاريخ الوصل (أقساط ومنهج، بدون الملغاة)؛ الرواتب حسب تاريخ دفعها (بدون الملغاة؛ المنقولة بلا تاريخ حسب شهرها)؛ الصافي = الوارد + وارد آخر − الاسترجاع − رواتب الموظفين − مصاريف عامة − مصاريف ثابتة.
          تسليم الإدارة وسحب الشركاء لا يُطرحان من الصافي.
          {showUnknown && " «غير محدد»: دفعات سُجّلت قبل إضافة نوع الدفع."}
        </p>

        <div style={box}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#eff6ff", color: "#1e40af" }}>
                <th style={cell}>الشهر</th>
                {monthColumns.map(([key, label]) => <th key={key} style={money}>{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.month}>
                  <td style={cell} dir="ltr">{m.month}</td>
                  {monthColumns.map(([key]) => (
                    <td key={key} style={{ ...money, ...(key === "net" && { fontWeight: 600, color: m.net < 0 ? "#b91c1c" : "#15803d" }) }}>
                      {m[key] ? formatMoney(m[key]) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
              {months.length === 0 && (
                <tr><td colSpan={monthColumns.length + 1} style={{ ...cell, color: "#64748b" }}>لا توجد حركات مالية بعد.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: "bold", backgroundColor: "#f8fafc" }}>
                <td style={cell}>المجموع</td>
                {monthColumns.map(([key]) => <td key={key} style={money}>{formatMoney(monthTotal(key))}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>

        </>)}

        {tab === "box" && (<>
        <p style={{ color: "#64748b", marginTop: 0 }}>
          {range && <>من <span dir="ltr">{range.from}</span> إلى <span dir="ltr">{range.to}</span>. </>}
          الصافي من «الملخص»؛ حصة كل شريك من الصافي، والسحب ما سُجّل باسمه أدناه («سحب البراق»…).
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
          <section>
            <h2 style={{ fontSize: "18px", color: "#1e40af", marginBottom: "4px" }}>الصندوق</h2>
            <div style={box}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {[
                    ["الصافي", net],
                    ["سُلّم إلى الإدارة: الواصل النقدي + المناهج والزي (من تشرين الأول 2026)", manualHandovers - handovers],
                    ...(manualHandovers ? [["سُلّم إلى الإدارة: المسجل يدوياً سابقاً", -manualHandovers]] : []),
                    ["صندوق المركز (الصافي − التسليم)", net - handovers, true],
                    ["صندوق الإدارة (التسليم − سحب الشركاء)", handovers - withdrawals, true]
                  ].map(([label, value, strong]) => (
                    <tr key={label} style={strong ? { fontWeight: "bold", backgroundColor: "#f8fafc" } : undefined}>
                      <td style={cell}>{label}</td>
                      <td style={{ ...money, color: value < 0 ? "#b91c1c" : undefined }}>{formatMoney(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: "18px", color: "#1e40af", marginBottom: "4px" }}>حصص الشركاء</h2>
            <div style={box}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#eff6ff", color: "#1e40af" }}>
                    <th style={cell}>الشريك</th>
                    <th style={money}>النسبة</th>
                    <th style={money}>الاستحقاق</th>
                    <th style={money}>السحب</th>
                    <th style={money}>الباقي</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((p) => (
                    <tr key={p.name}>
                      <td style={cell}>{p.name}</td>
                      <td style={money}>{(p.share * 100).toLocaleString("en-US")}%</td>
                      <td style={money}>{formatMoney(Math.round(p.due))}</td>
                      <td style={money}>{formatMoney(p.taken)}</td>
                      <td style={{ ...money, fontWeight: 600, color: p.left < 0 ? "#b91c1c" : "#15803d" }}>{formatMoney(Math.round(p.left))}</td>
                    </tr>
                  ))}
                  {unassigned !== 0 && (
                    <tr>
                      <td style={{ ...cell, color: "#b45309" }} colSpan={3}>سحب لا يحمل اسم شريك</td>
                      <td style={money}>{formatMoney(unassigned)}</td>
                      <td style={cell} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <h2 style={{ fontSize: "18px", color: "#1e40af", marginBottom: "8px" }}>الحركات: مبيعات المركز، تسليم الإدارة، سحب الشركاء</h2>
        <ExpensesBoard kind="BOX" />
        </>)}
      </main>
    </>
  );
}
