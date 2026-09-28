// The logic whose mistakes reach money or paper: overdue amounts, the
// amount in words on printed receipts, search, and which files the
// backups page will serve or restore. Run: npm test

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dueSchedule, duesOn } from "../lib/dues.js";
import { amountInWords, numberToArabicWords } from "../lib/tafqeet.js";
import { matchesSearch } from "../lib/arabic.js";

const { isBackupName } = createRequire(import.meta.url)("../lib/backup.js");

const monthly = (fee, start, plan = "MONTHLY") => ({
  tuitionFee: fee,
  paymentPlan: plan,
  enrollmentDate: start,
  yearName: "2025-2026"
});

test("monthly: morning year is 8 equal instalments, October to May", () => {
  const { dates, assumed } = dueSchedule(monthly(800000, "2025-10-01"));
  assert.equal(assumed, false);
  assert.deepEqual(dates.map((d) => d.day), [
    "2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01",
    "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01"
  ]);
  assert.ok(dates.every((d) => d.amount === 100000));
});

test("monthly: rounding lands on the last instalment, total is exact", () => {
  const { dates } = dueSchedule(monthly(1000000, "2025-11-01"));
  assert.equal(dates.length, 7);
  assert.equal(dates[0].amount, 142857);
  assert.equal(dates[6].amount, 142858);
  assert.equal(dates.reduce((sum, d) => sum + d.amount, 0), 1000000);
});

test("monthly: a late starter pays over the months that remain", () => {
  const { dates } = dueSchedule(monthly(300000, "2026-03-10"));
  assert.deepEqual(dates.map((d) => d.day), ["2026-03-10", "2026-04-01", "2026-05-01"]);
});

test("no plan recorded is treated as monthly and flagged as assumed", () => {
  const { plan, assumed } = dueSchedule(monthly(800000, "2025-10-01", null));
  assert.equal(plan, "MONTHLY");
  assert.equal(assumed, true);
});

test("yearly: two halves, the second 4½ months later", () => {
  const { dates } = dueSchedule(monthly(1000001, "2025-10-01", "YEARLY"));
  assert.deepEqual(dates, [
    { day: "2025-10-01", amount: 500001 },
    { day: "2026-02-16", amount: 500000 }
  ]);
});

test("overdue = due so far minus paid, never negative", () => {
  const enrollment = monthly(800000, "2025-10-01");
  const dues = duesOn("2025-12-15", enrollment, 150000);
  assert.equal(dues.expected, 300000);
  assert.equal(dues.overdue, 150000);
  assert.equal(dues.nextDue.day, "2026-01-01");
  assert.equal(duesOn("2025-12-15", enrollment, 900000).overdue, 0);
  // Due on the day itself, not the day after.
  assert.equal(duesOn("2025-11-01", enrollment, 0).expected, 200000);
});

test("no fee or no start date: nothing is due", () => {
  assert.equal(duesOn("2026-01-01", monthly(0, "2025-10-01"), 0).overdue, 0);
  assert.equal(duesOn("2026-01-01", monthly(800000, ""), 0).overdue, 0);
});

test("amount in words, as printed on receipts", () => {
  assert.equal(amountInWords(1600000), "فقط مليون وستمائة ألف دينار عراقي لا غير");
  const cases = {
    0: "صفر",
    21: "واحد وعشرون",
    250: "مائتان وخمسون",
    1001: "ألف وواحد",
    2000: "ألفان",
    3000: "ثلاثة آلاف",
    12000: "اثنا عشر ألف",
    15000: "خمسة عشر ألف",
    200000: "مائتا ألف",
    250000: "مائتان وخمسون ألف",
    2500000: "مليونان وخمسمائة ألف"
  };
  for (const [n, words] of Object.entries(cases)) {
    assert.equal(numberToArabicWords(Number(n)), words, `for ${n}`);
  }
  assert.equal(amountInWords(-1), "");
  assert.equal(amountInWords(1e12), "");
});

test("search folds spelling variants, digits and phone spacing", () => {
  assert.ok(matchesSearch("أحمد علي", "احمد"));
  assert.ok(matchesSearch("فاطمة", "فاطمه"));
  assert.ok(matchesSearch("علی", "علي")); // Persian keyboard ی
  assert.ok(matchesSearch("مُحَمَّد", "محمد")); // tashkeel
  assert.ok(matchesSearch("0770 123 4567", "07701234567"));
  assert.ok(matchesSearch("٠٧٧٠١٢٣", "0770123")); // Arabic-Indic digits
  assert.ok(matchesSearch("أحمد علي حسين", "حسين احمد")); // any word order
  assert.ok(!matchesSearch("أحمد علي", "محمود"));
  assert.ok(matchesSearch("anything", "   "));
});

test("backup file names: only our own, never a path", () => {
  for (const name of [
    "db-2026-09-25_2330.sql.gz",
    "photos-2026-09-25_2330.tar.gz",
    "db-2026-09-26_151200-pre-restore.sql.gz",
    "db-2026-09-26_151200-upload-2.sql.gz"
  ]) assert.ok(isBackupName(name), name);

  for (const name of [
    "db-2026-09-25_2330.tar.gz", // db must be SQL
    "photos-2026-09-25_2330.sql.gz",
    "../db-2026-09-25_2330.sql.gz",
    "db-2026-09-25_2330.sql.gz/x",
    ".env",
    ""
  ]) assert.ok(!isBackupName(name), name);
});

test("validateRiders accepts an ordered id list and rejects anything else", async () => {
  const { validateRiders } = await import("../lib/transport-lines.js");

  assert.deepEqual(validateRiders({ studentIds: [3, 1, 7] }), { studentIds: [3, 1, 7] });
  assert.deepEqual(validateRiders({ studentIds: [] }), { studentIds: [] });

  for (const bad of [null, {}, { studentIds: "1" }, { studentIds: [1, 1] }, { studentIds: [0] }, { studentIds: ["2"] }, { studentIds: [1.5] }]) {
    assert.ok(validateRiders(bad).error, JSON.stringify(bad));
  }
});

test("staff: name required, amounts and dates parsed, bad phone refused", async () => {
  const { checkStaff } = await import("../lib/staff.js");

  assert.equal(checkStaff({ name: "  " }).field, "name");
  assert.equal(checkStaff({ name: "س", phone: "abc" }).field, "phone");
  assert.equal(checkStaff({ name: "س", baseSalary: "كثير" }).field, "baseSalary");
  assert.equal(checkStaff({ name: "س", startDate: "2026-02-30" }).field, "startDate");

  const { data } = checkStaff({ name: " هبة ", phone: "٠٧٧٠ ١٢٣ ٤٥٦٧", baseSalary: "450,000", bonus: "", startDate: "2026-06-07" });
  assert.equal(data.name, "هبة");
  assert.equal(data.phone, "0770 123 4567");
  assert.equal(data.baseSalary, 450000);
  assert.equal(data.bonus, null);
  assert.equal(data.startDate.toISOString().slice(0, 10), "2026-06-07");
  assert.equal(data.isActive, true);
});

test("salary: net = salary + bonus − deductions, never negative", async () => {
  const { checkSalary } = await import("../lib/staff.js");
  const base = { staffId: 1, month: "2026-09", baseSalary: "700000" };

  assert.equal(checkSalary({ ...base, month: "2026-13" }).field, "month");
  assert.equal(checkSalary({ ...base, baseSalary: "" }).field, "baseSalary");
  assert.equal(checkSalary({ ...base, deduction: "800000" }).field, "deduction");
  assert.equal(checkSalary({ ...base, paymentMethod: "CHEQUE" }).field, "paymentMethod");

  const { data } = checkSalary({ ...base, bonus: "160000", deduction: "200000", paidOn: "2026-09-07" });
  assert.deepEqual([data.baseSalary, data.bonus, data.deduction], [700000, 160000, 200000]);
  assert.equal(data.paidOn.toISOString().slice(0, 10), "2026-09-07");
});

test("monthly summary: income by method, refunds and spending by month", async () => {
  const { monthlySummary, checkExpense } = await import("../lib/finance.js");

  const months = monthlySummary({
    payments: [
      { amount: 100, paymentType: "TUITION", paymentMethod: "CASH", paymentDate: "2026-09-10T08:00:00Z" },
      { amount: 50, paymentType: "CURRICULUM", paymentMethod: "CARD", paymentDate: "2026-09-11T08:00:00Z" },
      { amount: 30, paymentType: "TUITION", paymentMethod: null, paymentDate: "2026-09-12T08:00:00Z" },
      { amount: 20, paymentType: "REFUND", paymentMethod: "CASH", paymentDate: "2026-09-13T08:00:00Z" },
      // 23:30 UTC on 31 August is already 1 September in Iraq.
      { amount: 7, paymentType: "TUITION", paymentMethod: "CASH", paymentDate: "2026-08-31T23:30:00Z" }
    ],
    salaries: [{ month: "2026-09", net: 60 }],
    expenses: [
      { date: "2026-09-01", category: "GENERAL", amount: 10 },
      { date: "2026-08-15", category: "ASSET", amount: 5 }
    ]
  });

  assert.deepEqual(months.map((m) => m.month), ["2026-09", "2026-08"]);
  const [sep, aug] = months;
  assert.deepEqual(
    [sep.cash, sep.card, sep.unknown, sep.refunds, sep.salaries, sep.expenses, sep.income, sep.net],
    [107, 50, 30, 20, 60, 10, 167, 97]
  );
  assert.deepEqual([aug.assets, aug.net], [5, -5]);

  // Other income adds; handovers and partners' withdrawals don't touch net.
  const [oct] = monthlySummary({
    payments: [],
    salaries: [],
    expenses: [
      { date: "2026-10-01", category: "INCOME", amount: 100 },
      { date: "2026-10-02", category: "SALARY", amount: 30 },
      { date: "2026-10-03", category: "HANDOVER", amount: 40 },
      { date: "2026-10-04", category: "WITHDRAWAL", amount: 50 }
    ]
  });
  assert.deepEqual([oct.otherIncome, oct.salaries, oct.handovers, oct.withdrawals, oct.net], [100, 30, 40, 50, 70]);

  assert.equal(checkExpense({ date: "2026-09-01", item: "", amount: "5" }).field, "item");
  assert.equal(checkExpense({ date: "2026-09-01", item: "نثريات", amount: "0" }).field, "amount");
  assert.equal(checkExpense({ date: "2026-09-01", item: "نثريات", amount: "5", category: "X" }).field, "category");
  assert.equal(checkExpense({ date: "٢٠٢٦-٠٩-٠١", item: "نثريات", amount: "٢١٨٬٠٠٠" }).data.amount, 218000);
});

test("school years: the next one, and the months each covers", async () => {
  const { nextYearName, yearMonths } = await import("../lib/finance.js");

  assert.equal(nextYearName("2025-2026"), "2026-2027");
  assert.equal(nextYearName("2027 - 2028"), "2028-2029");
  assert.equal(nextYearName("السنة الأولى"), null);
  // A summer belongs to the year that just ended.
  assert.deepEqual(yearMonths("2025-2026"), { from: "2025-09", to: "2026-08" });
  assert.equal(yearMonths(undefined), null);
});
