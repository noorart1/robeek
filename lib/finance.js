
// المالية: expense validation and the monthly summary, shared by the API
// routes, the finance page and the tests.

import { parseAmount, toWesternDigits } from "./digits.js";
import { iraqToday, parseDay } from "./dates.js";
import { PAYMENT_METHODS } from "./labels.js";

// The Expense table is the centre's ledger outside children's receipts
// (the accounts workbook's sheets). INCOME adds to the month; HANDOVER
// (cash handed to the management) and WITHDRAWAL (partners' draws) move
// money that was already earned, so they are shown but not subtracted.
export const EXPENSE_CATEGORIES = {
  GENERAL: "مصاريف عامة",
  ASSET: "أصول وتطوير",
  SALARY: "رواتب (مجموع)",
  INCOME: "وارد آخر",
  HANDOVER: "تسليم الإدارة",
  WITHDRAWAL: "سحب الشركاء"
};

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
// its own: a new one would count those salaries twice in the summary.
// `was` is the category of the row being edited (none when adding).
// Returns { data } ready for Prisma, or { error, field }.
export function checkExpense(body, was = null) {
  if (body.category === "SALARY" && was !== "SALARY") {
    return { error: "الرواتب تُدفع من المالية ← الرواتب، لا من المصاريف.", field: "category" };
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
// salaries: { month, net }; expenses: { date, category, amount }
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
    r[CATEGORY_COLUMN[e.category] ?? "expenses"] += Number(e.amount);
  }

  return [...months.values()]
    .map((r) => {
      const income = r.cash + r.card + r.unknown + r.otherIncome - r.refunds;
      return { ...r, income, net: income - r.salaries - r.expenses - r.assets };
    })
    .sort((a, b) => b.month.localeCompare(a.month));
}

// "2025-2026" → "2026-2027"; null for a name not in that form.
export function nextYearName(name) {
  const match = /^(\d{4})\s*-\s*(\d{4})$/.exec(name || "");
  return match ? `${Number(match[1]) + 1}-${Number(match[2]) + 1}` : null;
}

// The months a school year covers in the finance summary: September of
// its first year to August of its second, so a summer belongs to the
// year that just ended. null for a name not in "2025-2026" form.
export function yearMonths(name) {
  const match = /^(\d{4})\s*-\s*(\d{4})$/.exec(name || "");
  return match ? { from: `${match[1]}-09`, to: `${match[2]}-08` } : null;
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
