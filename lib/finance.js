
// المالية: expense validation and the monthly summary, shared by the API
// routes, the finance page and the tests.

import { parseAmount, toWesternDigits } from "./digits.js";
import { iraqToday, parseDay } from "./dates.js";
import { PAYMENT_METHODS, formatMoney } from "./labels.js";
import { salaryAmount } from "./staff.js";

// The Expense table is the centre's ledger outside children's receipts
// (the accounts workbook's sheets). INCOME adds to the month; HANDOVER
// (cash handed to الخزينة) and WITHDRAWAL (partners' draws) move
// money that was already earned, so they are shown but not subtracted.
export const EXPENSE_CATEGORIES = {
  GENERAL: "مصاريف عامة",
  ASSET: "مصاريف ثابتة",
  SALARY: "رواتب (مجموع)",
  INCOME: "وارد آخر",
  HANDOVER: "تسليم الخزينة",
  WITHDRAWAL: "سحب الشركاء"
};

// A box movement handed to الخزينة: entered by hand as WITHDRAWAL rows
// named «تسليم …» («تسليم الخزينة», the older «تسليم ابوحسن»), plus the
// old HANDOVER rows — money handed over, not a partner's draw.
export const isHandover = (e) =>
  e.category === "HANDOVER" || (e.category === "WITHDRAWAL" && Boolean(e.item?.includes("تسليم")));

// Summary column each category adds to.
const CATEGORY_COLUMN = {
  GENERAL: "expenses",
  ASSET: "assets",
  SALARY: "salaries",
  INCOME: "otherIncome",
  HANDOVER: "handovers",
  WITHDRAWAL: "withdrawals"
};

// Suggestions only (the workbook's items and its analysis categories).
export const EXPENSE_ITEMS = [
  "نثريات", "منظفات", "قرطاسية", "ضيافة", "صيانة", "مرافق", "نقل",
  "اتصالات", "شراء زي", "إعلانات", "ألعاب", "رسوم"
];

// SALARY is only for the lump sums entered before الرواتب had payments of
// its own: a new one would count that money twice. HANDOVER is the old
// category; a new handover is a «تسليم الخزينة» WITHDRAWAL row.
// `was` is the category of the row being edited (none when adding).
// Returns { data } ready for Prisma, or { error, field }.
export function checkExpense(body, was = null) {
  if (body.category === "SALARY" && was !== "SALARY") {
    return { error: "الرواتب تُدفع من المالية ← رواتب الموظفين، لا من المصاريف.", field: "category" };
  }
  if (body.category === "HANDOVER" && was !== "HANDOVER") {
    return { error: "يُسجَّل تسليم الخزينة باختيار البند «تسليم الخزينة».", field: "category" };
  }

  const date = parseDay(toWesternDigits(String(body.date ?? "")));
  if (!date) return { error: "التاريخ غير صالح.", field: "date" };

  const item = typeof body.item === "string" ? body.item.trim().slice(0, 191) : "";
  if (!item) return { error: "يرجى إدخال بند المصروف.", field: "item" };

  const amount = parseAmount(body.amount);
  if (!amount) return { error: "يرجى إدخال المبلغ بالأرقام.", field: "amount" };

  const category = body.category || "GENERAL";
  if (!(category in EXPENSE_CATEGORIES)) return { error: "نوع المصروف غير صالح.", field: "category" };

  const paymentMethod = body.paymentMethod || null;
  if (paymentMethod && !(paymentMethod in PAYMENT_METHODS)) {
    return { error: "نوع الدفع غير صالح.", field: "paymentMethod" };
  }

  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 5000) : null;

  return { data: { date, item, amount, category, paymentMethod, notes } };
}

export const formatExpense = (e) => ({
  ...e,
  amount: Number(e.amount),
  date: new Date(e.date).toISOString().slice(0, 10)
});

// One row per month, newest first:
//   receipts by نوع الدفع (cash / card / unknown — payments from before the
//   field existed), other income, refunds, salaries, expenses, assets, and
//   what is left (net); handovers and withdrawals alongside, outside net.
// payments: non-voided { amount, paymentType, paymentMethod, paymentDate }
// salaries: { month, net }; expenses: { date, category, amount, item }
export function monthlySummary({ payments, salaries, expenses }) {
  const months = new Map();
  const row = (month) => {
    if (!months.has(month)) {
      months.set(month, {
        month, cash: 0, card: 0, unknown: 0, otherIncome: 0, refunds: 0,
        salaries: 0, expenses: 0, assets: 0, handovers: 0, withdrawals: 0
      });
    }
    return months.get(month);
  };

  for (const p of payments) {
    // paymentDate is a moment in time; the month is Iraq's.
    const r = row(iraqToday(new Date(p.paymentDate)).slice(0, 7));
    const amount = Number(p.amount);
    if (REFUND_TYPES.includes(p.paymentType)) r.refunds += amount;
    else if (p.paymentMethod === "CASH") r.cash += amount;
    else if (p.paymentMethod === "CARD") r.card += amount;
    else r.unknown += amount;
  }

  for (const s of salaries) row(s.month).salaries += Number(s.net);

  for (const e of expenses) {
    const r = row(new Date(e.date).toISOString().slice(0, 7));
    r[isHandover(e) ? "handovers" : CATEGORY_COLUMN[e.category] ?? "expenses"] += Number(e.amount);
  }

  return [...months.values()]
    .map((r) => {
      const income = r.cash + r.card + r.unknown + r.otherIncome - r.refunds;
      return { ...r, income, net: income - r.salaries - r.expenses - r.assets };
    })
    .sort((a, b) => b.month.localeCompare(a.month));
}

// الإيرادات of the box tab: children's payments (non-voided) split into
// tuition by نوع الدفع, curriculum and uniform, and refunds. months: keep
// only payments whose Iraq month passes it.
export function incomeBreakdown(payments, months = () => true) {
  const totals = { cash: 0, card: 0, unknown: 0, curriculum: 0, refunds: 0 };
  for (const p of payments) {
    if (!months(iraqToday(new Date(p.paymentDate)).slice(0, 7))) continue;
    const amount = Number(p.amount);
    if (REFUND_TYPES.includes(p.paymentType)) totals.refunds += amount;
    else if (p.paymentType === "CURRICULUM") totals.curriculum += amount;
    else if (p.paymentMethod === "CASH") totals.cash += amount;
    else if (p.paymentMethod === "CARD") totals.card += amount;
    else totals.unknown += amount;
  }
  return totals;
}

// "2025-2026" → "2026-2027"; null for a name not in that form.
export function nextYearName(name) {
  const match = /^(\d{4})\s*-\s*(\d{4})$/.exec(name || "");
  return match ? `${Number(match[1]) + 1}-${Number(match[2]) + 1}` : null;
}

// The months a school year covers in the finance summary: October (its
// first school month) of its first year to September of its second, so a
// summer and the weeks before the next year belong to the year that ended. null for a name not in "2025-2026" form.
export function yearMonths(name) {
  const match = /^(\d{4})\s*-\s*(\d{4})$/.exec(name || "");
  return match ? { from: `${match[1]}-10`, to: `${match[2]}-09` } : null;
}

// Refunds are stored positive and subtract from what they refund.
export const REFUND_TYPES = ["REFUND", "CURRICULUM_REFUND"];

// What was paid towards tuition and towards curriculum/uniform, net of
// refunds. Voided receipts never count. The one place this is summed.
export function paidTotals(payments) {
  const totals = { tuition: 0, curriculum: 0 };
  for (const p of payments) {
    if (p.voidedAt) continue;
    const amount = Number(p.amount);
    const type = p.paymentType || "TUITION";
    if (type === "TUITION") totals.tuition += amount;
    else if (type === "REFUND") totals.tuition -= amount;
    else if (type === "CURRICULUM") totals.curriculum += amount;
    else if (type === "CURRICULUM_REFUND") totals.curriculum -= amount;
  }
  return totals;
}

// حصص الشركاء, as in the accounts workbook's «الرئيسية». A withdrawal
// belongs to the partner whose name its item contains («سحب البراق»).
export const PARTNERS = [
  { name: "البراق", share: 0.585 },
  { name: "ابوحسن", share: 0.35 },
  { name: "ابوحوراء", share: 0.065 }
];

const dayMonth = (date) => new Date(date).toISOString().slice(0, 7);

// The months the finance page covers for a year view (lib/year-view.js):
// yearMonths, and the active year on until the next one is started.
export function viewRange({ year, isActive }) {
  const range = yearMonths(year?.name);
  const thisMonth = iraqToday().slice(0, 7);
  return range && isActive && thisMonth > range.to ? { ...range, to: thisMonth } : range;
}

// الصندوق of the box tab over range (null: every month), read through
// client (Prisma). تسليم الخزينة moves money from صندوق المركز to الخزينة,
// and the partners draw (سحب …) from الخزينة:
//   صندوق المركز = إجمالي الإيرادات − المصروفات − تسليم الخزينة
//   الخزينة = تسليم الخزينة − سحب الشركاء
// exceptId leaves out the movement being edited.
export async function boxBalances(client, range, exceptId = null) {
  const [payments, salaries, allExpenses] = await Promise.all([
    client.payment.findMany({
      where: { voidedAt: null },
      select: { amount: true, paymentType: true, paymentMethod: true, paymentDate: true }
    }),
    // Salaries as paid (voided receipts never count), in the month they were
    // paid, so الصندوق follows the cash. Imported payments have no date:
    // they stay under the salary's own month.
    client.salaryPayment.findMany({
      where: { voidedAt: null },
      select: { amount: true, paymentType: true, paidOn: true, Salary: { select: { month: true } } }
    }),
    client.expense.findMany({
      where: exceptId ? { id: { not: exceptId } } : undefined,
      select: { date: true, category: true, amount: true, item: true }
    })
  ]);
  const inRange = (m) => !range || (m >= range.from && m <= range.to);
  const months = monthlySummary({
    payments,
    salaries: salaries.map((p) => ({ month: p.paidOn ? dayMonth(p.paidOn) : p.Salary.month, net: salaryAmount(p) })),
    expenses: allExpenses
  }).filter((m) => inRange(m.month));
  const monthTotal = (key) => months.reduce((sum, m) => sum + m[key], 0);

  const income = incomeBreakdown(payments, inRange);
  const received = income.cash + income.card + income.unknown + income.curriculum;
  // إجمالي الإيرادات: children's receipts (tuition, curriculum and uniform)
  // less their refunds; وارد آخر is not part of it.
  const totalIncome = received - income.refunds;
  const spent = monthTotal("salaries") + monthTotal("expenses") + monthTotal("assets");
  const handovers = monthTotal("handovers");
  const withdrawals = monthTotal("withdrawals");

  return {
    payments, allExpenses, months, monthTotal, income, received, totalIncome, spent, handovers, withdrawals,
    centreBox: totalIncome - spent - handovers,
    treasury: handovers - withdrawals
  };
}

// What a row does to the two boxes: تسليم الخزينة moves its amount from
// صندوق المركز to الخزينة, a partner's draw takes it from الخزينة.
function boxEffect(e) {
  if (e?.category !== "WITHDRAWAL") return { centreBox: 0, treasury: 0 };
  const amount = Number(e.amount);
  return isHandover(e) ? { centreBox: -amount, treasury: amount } : { centreBox: 0, treasury: -amount };
}

// Adding, changing or deleting a movement may not take a box below zero:
// a movement takes no more than its box holds, and a handover is not cut
// or deleted once الخزينة has spent it. data: checkExpense's (null when
// deleting); current: the row being changed ({ id, category, item,
// amount }), null when adding. A box already below zero (old data) only
// blocks changes that make it worse. Returns an error message, or null.
export async function checkBoxMovement(client, range, data, current = null) {
  if (data?.category !== "WITHDRAWAL" && current?.category !== "WITHDRAWAL") return null;
  const base = await boxBalances(client, range, current?.id);
  const before = boxEffect(current);
  const after = boxEffect(data);
  // The box data takes its amount from.
  const source = data?.category === "WITHDRAWAL" ? (isHandover(data) ? "centreBox" : "treasury") : null;

  for (const [key, box] of [["centreBox", "صندوق المركز"], ["treasury", "الخزينة"]]) {
    const now = base[key] + before[key];
    const then = base[key] + after[key];
    if (then >= 0 || then >= now) continue;
    return key === source
      ? `المبلغ أكبر من رصيد ${box} (${formatMoney(Math.max(base[key], 0))}).`
      : `لا يمكن: سيصبح رصيد ${box} أقل من صفر.`;
  }
  return null;
}
