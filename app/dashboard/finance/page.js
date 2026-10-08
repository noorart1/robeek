
import prisma from "../../../lib/prisma";
import { requirePageUser } from "../../../lib/auth";
import { FINANCE_TABS, canFinance } from "../../../lib/finance-access";
import { SHIFTS, classLabel, formatMoney, yearLabel } from "../../../lib/labels";
import { formatStudent, studentSelect } from "../../../lib/student-data";
import { PARTNERS, boxBalances, isHandover, paidTotals, viewRange } from "../../../lib/finance";
import { matchesSearch } from "../../../lib/arabic";
import { iraqToday } from "../../../lib/dates";
import { studentView, yearView } from "../../../lib/year-view";
import Link from "next/link";
import AppHeader from "../../../components/AppHeader";
import SalariesBoard from "../../../components/SalariesBoard";
import ExpensesBoard from "../../../components/ExpensesBoard";

export const dynamic = "force-dynamic";

const dayMonth = (date) => new Date(date).toISOString().slice(0, 7);

// Each tab holds only its own ledger: the two expense tabs, and the box
// tab with الإيرادات والأرباح, الصندوق, الحصص and the money moving in and
// out of them. A معاون sees only the tabs given to them
// (lib/finance-access.js), read-only unless also allowed to change them.
const TABS = FINANCE_TABS;
const BOARD = { general: "GENERAL", fixed: "ASSET" };

// The chosen month (?month) goes with every tab; the year is the header's.
const keep = (params) => ({
  ...(params.month && { month: params.month })
});

function Tabs({ tab, tabs, params }) {
  return (
    <nav style={{ display: "flex", gap: "6px", marginBottom: "16px", borderBottom: "1px solid #e2e8f0" }}>
      {tabs.map((key) => [key, TABS[key]]).map(([key, label]) => (
        <Link
          key={key}
          href={`/dashboard/finance?${new URLSearchParams({ ...(key !== tabs[0] && { tab: key }), ...keep(params) })}`}
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

function ReadOnlyNote() {
  return (
    <p role="status" style={{ padding: "8px 14px", backgroundColor: "#f1f5f9", color: "#475569", borderRadius: "8px", marginTop: 0 }}>
      للاطلاع فقط: لا يمكنك التعديل في هذا القسم.
    </p>
  );
}

const cell = {
  padding: "10px 12px",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "right",
  whiteSpace: "nowrap"
};

const money = { ...cell, textAlign: "left", fontVariantNumeric: "tabular-nums" };

// A white card with its title inside (the box tab).
const panel = { backgroundColor: "#ffffff", borderRadius: "12px", padding: "16px 18px", border: "1px solid #e2e8f0" };
const panelTitle = { fontSize: "18px", color: "#1e40af", margin: "0 0 10px" };

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
  const user = await requirePageUser(["ADMIN", "DEPUTY"]);
  const params = await searchParams;
  const tabs = Object.keys(TABS).filter((key) => canFinance(user, key));
  // ?tab=expenses was the one ledger tab before it was split.
  const asked = params.tab === "expenses" ? "general" : params.tab;
  const tab = tabs.includes(asked) ? asked : tabs[0];
  const readOnly = !canFinance(user, tab, true);

  if (!tab) {
    return (
      <>
        <AppHeader user={user} active="/dashboard/finance" />
        <main style={{ maxWidth: "1200px", margin: "24px auto", padding: "0 20px" }}>
          <h1 style={{ color: "#1e40af" }}>الملف المالي والأرصدة</h1>
          <p style={{ color: "#64748b" }}>لم تُمنح صلاحية أي قسم من المالية بعد. اطلبها من المدير.</p>
        </main>
      </>
    );
  }

  // The year chosen in the header (lib/year-view.js): a school year, or a
  // summer course on its own (May to August).
  const view = await yearView();
  const { year, isActive: isActiveYear } = view;
  const range = viewRange(view);
  const thisMonth = iraqToday().slice(0, 7);
  // The ledgers open on this month, or an earlier year's last.
  const defaultMonth = range && (thisMonth < range.from || thisMonth > range.to) ? range.to : thisMonth;

  if (tab === "salaries" || tab in BOARD) {
    return (
      <>
        <AppHeader user={user} active="/dashboard/finance" />
        <main style={{ maxWidth: "1440px", margin: "24px auto", padding: "0 20px" }}>
          <h1 style={{ color: "#1e40af", marginBottom: "12px" }}>الملف المالي والأرصدة</h1>
          <Tabs tab={tab} tabs={tabs} params={params} />
          {readOnly && <ReadOnlyNote />}
          {tab === "salaries"
            ? <SalariesBoard defaultMonth={defaultMonth} readOnly={readOnly} staffEditable={canFinance(user, "salaries", true)} />
            : <ExpensesBoard key={tab} kind={BOARD[tab]} defaultMonth={defaultMonth} readOnly={readOnly} />}
        </main>
      </>
    );
  }

  // الملخص الشهري: the months of the chosen school year (October to
  // September), or every month when the year's name has no dates in it.
  const {
    allExpenses, months, monthTotal, income, received, totalIncome, spent, handovers, withdrawals, centreBox, treasury
  } = await boxBalances(prisma, range);
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
    ["handovers", "تسليم الخزينة"],
    ["withdrawals", "سحب الشركاء"]
  ];

  // الحصص: صافي الربح = الإيرادات − المصروفات; each partner is due their
  // share of it. Both cover the chosen year only.
  const net = monthTotal("net");
  const inRange = (e) => !range || (dayMonth(e.date) >= range.from && dayMonth(e.date) <= range.to);
  const draws = allExpenses.filter((e) => e.category === "WITHDRAWAL" && !isHandover(e) && inRange(e));
  const partners = PARTNERS.map((p) => {
    const taken = draws.filter((e) => matchesSearch(e.item, p.name)).reduce((t, e) => t + Number(e.amount), 0);
    return { ...p, due: net * p.share, taken, left: net * p.share - taken };
  });
  const unassigned = withdrawals - partners.reduce((t, p) => t + p.taken, 0);

  const enrollmentSelect = {
    tuitionFee: true,
    status: true,
    Class: { select: { id: true, name: true, shift: true } },
    Student: { select: { status: true } },
    // Voided receipts never count.
    Payment: { where: { voidedAt: null }, select: { amount: true, paymentType: true } }
  };
  // The chosen year's only: a summer course has its own page (the header's
  // picker).
  const enrollments = year ? await prisma.enrollment.findMany({ where: { academicYearId: year.id }, select: enrollmentSelect }) : [];

  // Overdue as of today: the children here now, or everyone enrolled in an
  // earlier year, owing for it.
  const overdue = (
    await prisma.student.findMany({
      where: isActiveYear ? { status: "ACTIVE" } : { Enrollment: { some: { academicYearId: year?.id ?? -1 } } },
      select: studentSelect
    })
  )
    .map((s) => formatStudent(s, studentView(view)))
    .filter((s) => s.financial.overdue > 0);
  const overdueTotal = overdue.reduce((sum, s) => sum + s.financial.overdue, 0);

  const byShift = {};
  const byClass = new Map();
  const inactive = emptyTotals();
  const grand = emptyTotals();

  for (const enrollment of enrollments) {
    add(grand, enrollment);

    // Like the workbook's الغاء التسجيل row: money from children who have
    // left is shown separately rather than hidden.
    // In an earlier year everyone has left since: what counts is whether
    // the enrollment itself ended.
    if ((isActiveYear ? enrollment.Student.status : enrollment.status) !== "ACTIVE") {
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
          {year ? yearLabel(year.name) : "لا توجد سنة دراسية"}
          <span style={{ marginInlineStart: "auto" }}>المبالغ بالدينار العراقي</span>
        </div>

        <Tabs tab={tab} tabs={tabs} params={params} />
        {readOnly && tab === "box" && <ReadOnlyNote />}

        {tab === "summary" && (<>
        {(
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
          الوارد حسب تاريخ الوصل (أقساط ومنهج، بدون الملغاة)، {range?.summerId ? "ويشمل كل دفعات الدورة الصيفية أيّاً كان شهرها" : "بدون دفعات الدورة الصيفية"}؛ الرواتب حسب تاريخ دفعها (بدون الملغاة؛ المنقولة بلا تاريخ حسب شهرها)؛ الصافي = الوارد + وارد آخر − الاسترجاع − رواتب الموظفين − مصاريف عامة − مصاريف ثابتة.
          تسليم الخزينة وسحب الشركاء لا يُطرحان من الصافي.
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
          استحقاق كل شريك = صافي الربح × نسبته؛ والسحب ما سُجّل باسمه في «الحركات».
        </p>

        {/* The figures that matter, at a glance. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "12px", marginBottom: "20px" }}>
          {[
            ["إجمالي الإيرادات", totalIncome, "#15803d"],
            ["إجمالي المصروفات", -spent, "#b91c1c"],
            ["صافي الربح", net, "#1d4ed8", true],
            ["صندوق المركز", centreBox, "#0f766e"],
            // The card: what was handed to الخزينة; its panel below shows what is left.
            ["الخزينة", handovers, "#7c3aed"]
          ].map(([label, value, color, main]) => (
            <div key={label} style={{ ...panel, borderTop: `4px solid ${color}`, ...(main && { backgroundColor: "#eff6ff" }) }}>
              <div style={{ color: "#64748b", fontSize: "14px" }}>{label}</div>
              <div dir="ltr" style={{ fontSize: "24px", fontWeight: 700, color, textAlign: "right", fontVariantNumeric: "tabular-nums", marginTop: "4px" }}>
                {formatMoney(value)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "20px", marginBottom: "20px" }}>
          <section style={panel}>
            <h2 style={panelTitle}>الإيرادات والأرباح</h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {[
                  // الواصل: everything received from the parents, of
                  // which tuition by نوع الدفع and curriculum/uniform.
                  ["أقساط نقداً", income.cash, false, true],
                  ["أقساط بطاقة", income.card, false, true],
                  ...(income.unknown ? [["أقساط (نوع الدفع غير محدد)", income.unknown, false, true]] : []),
                  ["المنهج والزي", income.curriculum, false, true],
                  ["الواصل", received, true],
                  ...(income.refunds ? [["الاسترجاع", -income.refunds]] : []),
                  ["إجمالي الإيرادات", totalIncome, true],
                  ["الرواتب والمكافآت", -monthTotal("salaries")],
                  ["المصروفات العامة", -monthTotal("expenses")],
                  ["المصروفات الثابتة", -monthTotal("assets")],
                  ["صافي الربح", net, true]
                ].map(([label, value, strong, part]) => (
                  <tr key={label} style={strong ? { fontWeight: "bold", backgroundColor: "#f8fafc" } : undefined}>
                    {/* A part of الواصل: indented and quieter. */}
                    <td style={{ ...cell, whiteSpace: "normal", ...(part && { paddingInlineStart: "28px", color: "#64748b" }) }}>{label}</td>
                    <td style={{ ...money, color: value < 0 ? "#b91c1c" : part ? "#64748b" : undefined }}>{formatMoney(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {[
            ["صندوق المركز", [
              ["إجمالي الإيرادات", totalIncome],
              ["المصروفات (الرواتب والعامة والثابتة)", -spent],
              ["تسليم الخزينة", -handovers],
              ["الباقي", centreBox, true]
            ], "صندوق المركز = إجمالي الإيرادات − المصروفات − تسليم الخزينة."],
            ["الخزينة", [
              ["تسليم الخزينة (من صندوق المركز)", handovers],
              ...partners.map((p) => [`سحب ${p.name}`, -p.taken]),
              ...(unassigned ? [["سحب لا يحمل اسم شريك", -unassigned]] : []),
              ["الباقي", treasury, true]
            ], "الخزينة = تسليم الخزينة − سحب الشركاء."]
          ].map(([title, rows, note]) => (
            <section key={title} style={panel}>
              <h2 style={panelTitle}>{title}</h2>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  {rows.map(([label, value, strong]) => (
                    <tr key={label} style={strong ? { fontWeight: "bold", backgroundColor: "#f8fafc" } : undefined}>
                      <td style={{ ...cell, whiteSpace: "normal" }}>{label}</td>
                      <td style={{ ...money, color: value < 0 ? "#b91c1c" : undefined }}>{formatMoney(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ color: "#64748b", fontSize: "13px", margin: "10px 0 0" }}>{note}</p>
            </section>
          ))}
        </div>

        <section style={{ ...panel, marginBottom: "20px" }}>
          <h2 style={panelTitle}>الحصص</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px" }}>
            {partners.map((p) => {
              const used = p.due > 0 ? Math.min(100, Math.max(0, (p.taken / p.due) * 100)) : 0;
              return (
                <div key={p.name} style={{ border: "1px solid #e2e8f0", borderRadius: "10px", padding: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <strong style={{ fontSize: "17px", color: "#1e293b" }}>{p.name}</strong>
                    <span style={{ color: "#64748b" }}>{(p.share * 100).toLocaleString("en-US")}%</span>
                  </div>
                  {/* How much of what is due has been drawn. */}
                  <div style={{ height: "8px", backgroundColor: "#e2e8f0", borderRadius: "999px", margin: "10px 0", overflow: "hidden" }}>
                    <div style={{ width: `${used}%`, height: "100%", backgroundColor: p.left < 0 ? "#dc2626" : "#2563eb" }} />
                  </div>
                  {[
                    ["الاستحقاق", Math.round(p.due)],
                    ["السحب", p.taken],
                    ["الباقي", Math.round(p.left), p.left < 0 ? "#b91c1c" : "#15803d"]
                  ].map(([label, value, color]) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontWeight: color ? 700 : 400 }}>
                      <span style={{ color: "#475569" }}>{label}</span>
                      <span style={{ color, fontVariantNumeric: "tabular-nums" }}>{formatMoney(value)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {unassigned !== 0 && (
            <p style={{ color: "#b45309", margin: "12px 0 0" }}>
              سحب لا يحمل اسم شريك: {formatMoney(unassigned)}
            </p>
          )}
        </section>

        <section style={panel}>
          <h2 style={panelTitle}>الحركات</h2>
          <ExpensesBoard kind="BOX" defaultMonth={defaultMonth} readOnly={readOnly} />
        </section>
        </>)}
      </main>
    </>
  );
}
