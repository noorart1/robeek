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

test("summer course: monthly to August, yearly is the whole fee at the start", async () => {
  const summer = (fee, start, plan) => ({ tuitionFee: fee, paymentPlan: plan, enrollmentDate: start, yearName: "صيف 2026" });

  const { dates } = dueSchedule(summer(400000, "2026-05-03", "MONTHLY"));
  assert.deepEqual(dates.map((d) => d.day), ["2026-05-03", "2026-06-01", "2026-07-01", "2026-08-01"]);
  assert.ok(dates.every((d) => d.amount === 100000));

  assert.deepEqual(dueSchedule(summer(400000, "2026-06-15", "YEARLY")).dates, [{ day: "2026-06-15", amount: 400000 }]);
  // 3 × 100,000 (June, July, August): two due by 10 July, one paid.
  assert.equal(duesOn("2026-07-10", summer(300000, "2026-06-01", "MONTHLY"), 100000).overdue, 100000);

  const { isSummerYear, yearLabel, summerYearName } = await import("../lib/labels.js");
  assert.equal(summerYearName("2026"), "صيف 2026");
  assert.ok(isSummerYear("صيف 2026") && !isSummerYear("2025-2026"));
  assert.equal(yearLabel("صيف 2026"), "الدورة الصيفية 2026");
  assert.equal(yearLabel("2025-2026"), "السنة الدراسية 2025-2026");
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

  const { data } = checkStaff({ name: " هبة ", phone: "٠٧٧٠ ١٢٣ ٤٥٦٧", baseSalary: "450,000", bonus: "100", startDate: "2026-06-07" });
  assert.equal(data.name, "هبة");
  assert.equal(data.phone, "0770 123 4567");
  assert.equal(data.baseSalary, 450000);
  assert.equal("bonus" in data, false); // «المكافآت» is no longer entered
  assert.equal(data.startDate.toISOString().slice(0, 10), "2026-06-07");
  assert.equal(data.isActive, true);
});

test("salary: net = salary − deductions, never negative; no bonus entered", async () => {
  const { checkSalary } = await import("../lib/staff.js");
  const base = { staffId: 1, month: "2026-09", baseSalary: "700000" };

  assert.equal(checkSalary({ ...base, month: "2026-13" }).field, "month");
  assert.equal(checkSalary({ ...base, baseSalary: "" }).field, "baseSalary");
  assert.equal(checkSalary({ ...base, deduction: "800000" }).field, "deduction");

  const { data } = checkSalary({ ...base, bonus: "160000", deduction: "200000" });
  assert.deepEqual([data.baseSalary, data.bonus, data.deduction], [700000, undefined, 200000]);
});

test("salary payment: positive amount, valid month/date/method; voided never count", async () => {
  const { checkSalaryPayment, formatSalary } = await import("../lib/staff.js");
  const base = { staffId: 1, month: "2026-09", amount: "250000" };

  assert.equal(checkSalaryPayment({ ...base, amount: "0" }).field, "amount");
  assert.equal(checkSalaryPayment({ ...base, amount: "abc" }).field, "amount");
  assert.equal(checkSalaryPayment({ ...base, month: "2026-9" }).field, "month");
  assert.equal(checkSalaryPayment({ ...base, paidOn: "2026-02-30" }).field, "paidOn");
  assert.equal(checkSalaryPayment({ ...base, paymentMethod: "CHEQUE" }).field, "paymentMethod");

  const { data } = checkSalaryPayment({ ...base, amount: "٢٥٠٬٠٠٠", paidOn: "2026-09-07", paymentMethod: "CARD" });
  assert.equal(data.amount, 250000);
  assert.equal(data.paidOn.toISOString().slice(0, 10), "2026-09-07");

  const salary = formatSalary({
    baseSalary: "700000.00", bonus: "100000.00", deduction: "50000.00",
    SalaryPayment: [{ amount: "300000.00" }, { amount: "200000.00", voidedAt: new Date() }, { amount: "100000.00" }]
  });
  assert.deepEqual([salary.net, salary.paid, salary.remaining], [750000, 400000, 350000]);
  assert.equal(salary.SalaryPayment, undefined);

  // استرجاع: stored positive, taken off what was paid.
  assert.equal(checkSalaryPayment({ ...base, paymentType: "GIFT" }).field, "paymentType");
  assert.equal(checkSalaryPayment({ ...base, paymentType: "BONUS" }).data.paymentType, "BONUS");
  assert.equal(checkSalaryPayment(base).data.paymentType, "SALARY");
  const refunded = formatSalary({
    baseSalary: "700000.00", bonus: "0.00", deduction: "0.00",
    SalaryPayment: [{ amount: "700000.00" }, { amount: "50000.00", paymentType: "REFUND" }]
  });
  assert.deepEqual([refunded.paid, refunded.remaining], [650000, 50000]);
});

test("pay change: logged only when the salary really changes", async () => {
  const { payChange } = await import("../lib/staff.js");
  const user = { fullName: "المدير" };

  // Prisma Decimals (strings here) against parsed numbers: equal is no change.
  assert.equal(payChange(1, { baseSalary: "1000.00", bonus: null }, { baseSalary: 1000, bonus: null }, user), null);
  assert.deepEqual(payChange(1, { baseSalary: "1000.00", bonus: null }, { baseSalary: 2000, bonus: null }, user), {
    staffId: 1, oldBaseSalary: 1000, newBaseSalary: 2000, changedBy: "المدير"
  });
  assert.equal(payChange(1, {}, { baseSalary: null, bonus: null }, user), null);
  assert.equal(payChange(1, { baseSalary: 1000, bonus: 0 }, { baseSalary: 1000, bonus: 50 }, user), null);
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
  // تسليم الإدارة comes from the receipts only from October 2026 on:
  // before that, only what was entered by hand.
  assert.equal(sep.handovers, 0);
  const [nov] = monthlySummary({
    payments: [
      { amount: 100, paymentType: "TUITION", paymentMethod: "CASH", paymentDate: "2026-11-10T08:00:00Z" },
      { amount: 50, paymentType: "CURRICULUM", paymentMethod: "CARD", paymentDate: "2026-11-11T08:00:00Z" },
      { amount: 30, paymentType: "TUITION", paymentMethod: null, paymentDate: "2026-11-12T08:00:00Z" },
      { amount: 40, paymentType: "TUITION", paymentMethod: "CARD", paymentDate: "2026-11-12T08:00:00Z" },
      { amount: 20, paymentType: "REFUND", paymentMethod: "CASH", paymentDate: "2026-11-13T08:00:00Z" }
    ],
    salaries: [],
    expenses: [{ date: "2026-11-20", category: "HANDOVER", amount: 5 }]
  });
  // cash and method-less tuition 100 + 30, curriculum 50 (any method), less
  // the cash refund 20, and the old hand-entered row 5; card tuition is not.
  assert.equal(nov.handovers, 165);
  const { handedOver } = await import("../lib/finance.js");
  assert.equal(handedOver({ amount: 90, paymentType: "TUITION", paymentMethod: "CARD" }), 0);
  assert.equal(handedOver({ amount: 90, paymentType: "REFUND", paymentMethod: "CARD" }), 0);
  assert.equal(handedOver({ amount: 15, paymentType: "CURRICULUM_REFUND", paymentMethod: "CASH" }), -15);

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
  // «تسليم الخزينة» (and the older «تسليم ابوحسن») is a handover, not a draw.
  const [dec] = monthlySummary({
    payments: [],
    salaries: [],
    expenses: [
      { date: "2026-12-01", category: "WITHDRAWAL", item: "تسليم الخزينة", amount: 10 },
      { date: "2026-12-02", category: "WITHDRAWAL", item: "تسليم ابوحسن", amount: 20 },
      { date: "2026-12-03", category: "WITHDRAWAL", item: "سحب البراق", amount: 30 }
    ]
  });
  assert.deepEqual([dec.handovers, dec.withdrawals, dec.net], [30, 30, 0]);

  assert.equal(checkExpense({ date: "2026-09-01", item: "", amount: "5" }).field, "item");
  assert.equal(checkExpense({ date: "2026-09-01", item: "نثريات", amount: "0" }).field, "amount");
  assert.equal(checkExpense({ date: "2026-09-01", item: "نثريات", amount: "5", category: "X" }).field, "category");
  assert.equal(checkExpense({ date: "٢٠٢٦-٠٩-٠١", item: "نثريات", amount: "٢١٨٬٠٠٠" }).data.amount, 218000);
  // رواتب (مجموع): no new ones (salaries would count twice); old ones stay editable.
  const lump = { date: "2026-09-06", item: "رواتب", amount: "6035000", category: "SALARY" };
  assert.equal(checkExpense(lump).field, "category");
  assert.equal(checkExpense(lump, "GENERAL").field, "category");
  assert.equal(checkExpense(lump, "SALARY").data.category, "SALARY");
  // تسليم الإدارة is worked out from the receipts: no new hand-entered ones.
  const handover = { date: "2026-09-06", item: "تسليم الإدارة", amount: "1000", category: "HANDOVER" };
  assert.equal(checkExpense(handover).field, "category");
  assert.equal(checkExpense(handover, "HANDOVER").data.category, "HANDOVER");
  const named = { date: "2026-10-06", item: "تسليم الخزينة", amount: "1000", category: "WITHDRAWAL" };
  assert.equal(checkExpense(named).field, "category");
  assert.equal(checkExpense(named, "WITHDRAWAL").data.item, "تسليم الخزينة");
});

test("school years: the next one, and the months each covers", async () => {
  const { nextYearName, yearMonths } = await import("../lib/finance.js");

  assert.equal(nextYearName("2025-2026"), "2026-2027");
  assert.equal(nextYearName("2027 - 2028"), "2028-2029");
  assert.equal(nextYearName("السنة الأولى"), null);
  // A summer belongs to the year that just ended.
  assert.deepEqual(yearMonths("2025-2026"), { from: "2025-10", to: "2026-09" });
  assert.equal(yearMonths(undefined), null);
});

test("paid totals: refunds subtract from their own kind, voided never count", async () => {
  const { paidTotals } = await import("../lib/finance.js");

  assert.deepEqual(
    paidTotals([
      { amount: 500, paymentType: "TUITION" },
      { amount: 200, paymentType: null },
      { amount: 100, paymentType: "REFUND" },
      { amount: 80, paymentType: "CURRICULUM" },
      { amount: 30, paymentType: "CURRICULUM_REFUND" },
      { amount: 999, paymentType: "TUITION", voidedAt: "2026-09-01" }
    ]),
    { tuition: 600, curriculum: 50 }
  );
});

test("registering ahead of the term starts on its first day, never earlier than today", async () => {
  const { defaultEnrollmentDate } = await import("../lib/enrollment-fields.js");
  const day = (...args) => defaultEnrollmentDate(...args).toISOString().slice(0, 10);
  assert.equal(day("2027-2028", "MORNING", "2027-07-15"), "2027-10-01");
  assert.equal(day("2027-2028", "EVENING", "2027-07-15"), "2027-11-01");
  assert.equal(day("صيف 2027", null, "2027-04-10"), "2027-05-01");
  assert.equal(day("2026-2027", "MORNING", "2027-01-20"), "2027-01-20");
  assert.equal(day("whatever", "MORNING", "2027-01-20"), "2027-01-20");
});

test("the summer that can be started: this year's until August, then next year's", async () => {
  const { upcomingSummerName } = await import("../lib/labels.js");
  assert.equal(upcomingSummerName("2026-08-31"), "صيف 2026");
  assert.equal(upcomingSummerName("2026-09-01"), "صيف 2027");
  assert.equal(upcomingSummerName("2027-01-15"), "صيف 2027");
});

test("salary payments: a bonus is cash out but not towards the salary", async () => {
  const { salaryAmount, salaryPaid } = await import("../lib/staff.js");
  const payments = [
    { amount: 500000, paymentType: "SALARY" },
    { amount: 100000, paymentType: "BONUS" },
    { amount: 50000, paymentType: "REFUND" },
    { amount: 999, paymentType: "SALARY", voidedAt: new Date() }
  ];

  assert.equal(salaryPaid(payments), 450000);
  assert.equal(payments.filter((p) => !p.voidedAt).reduce((t, p) => t + salaryAmount(p), 0), 550000);
});

test("income breakdown: tuition by method, curriculum, refunds; matches the summary", async () => {
  const { incomeBreakdown, monthlySummary } = await import("../lib/finance.js");
  const payments = [
    { amount: 200000, paymentType: "TUITION", paymentMethod: "CASH", paymentDate: "2026-10-05T09:00:00Z" },
    { amount: 150000, paymentType: null, paymentMethod: "CARD", paymentDate: "2026-10-06T09:00:00Z" },
    { amount: 100000, paymentType: "CURRICULUM", paymentMethod: "CASH", paymentDate: "2026-10-07T09:00:00Z" },
    { amount: 50000, paymentType: "REFUND", paymentMethod: "CASH", paymentDate: "2026-10-08T09:00:00Z" },
    { amount: 999, paymentType: "TUITION", paymentMethod: "CASH", paymentDate: "2026-09-30T09:00:00Z" }
  ];
  const october = (m) => m === "2026-10";
  const income = incomeBreakdown(payments, october);

  assert.deepEqual(income, { cash: 200000, card: 150000, unknown: 0, curriculum: 100000, refunds: 50000 });
  const [summary] = monthlySummary({ payments: payments.slice(0, 4), salaries: [], expenses: [] });
  assert.equal(income.cash + income.card + income.unknown + income.curriculum - income.refunds, summary.income);
});

test("amounts typed with Arabic or Persian digits are read as numbers", async () => {
  const { parseAmount } = await import("../lib/digits.js");

  assert.equal(parseAmount("١٬٦٠٠٬٠٠٠"), 1600000);
  assert.equal(parseAmount("۱۶۰۰۰۰۰"), 1600000);
  assert.equal(parseAmount("1,600,000"), 1600000);
  assert.equal(parseAmount(" ٢٥٠ ٠٠٠ "), 250000);
  assert.equal(parseAmount("١٢٫٥"), 12.5);
  assert.equal(parseAmount(750000), 750000);
  // Not a number, or one the database would round: refused, never guessed.
  for (const bad of ["", "abc", "-5", "1.600.000", "12.345", "1e6", "١٢x"]) {
    assert.equal(parseAmount(bad), null, bad);
  }
});

test("every money input goes through parseAmount", async () => {
  const { validateEnrollment } = await import("../lib/enrollment-fields.js");
  const { checkSalaryPayment, checkSalary } = await import("../lib/staff.js");
  const { checkExpense } = await import("../lib/finance.js");

  assert.equal(validateEnrollment({ classId: 1, tuitionFee: "١٬٤٠٠٬٠٠٠" }).data.tuitionFee, 1400000);
  assert.equal(validateEnrollment({ classId: 1, tuitionFee: "١.٤.٠" }).field, "tuitionFee");
  assert.equal(checkSalaryPayment({ staffId: 1, month: "2026-10", amount: "۸۳۵٬۰۰۰" }).data.amount, 835000);
  assert.equal(checkSalaryPayment({ staffId: 1, month: "2026-10", amount: "٠" }).field, "amount");
  assert.equal(checkSalary({ staffId: 1, month: "2026-10", baseSalary: "٩٠٠٠٠٠", deduction: "٥٠٬٠٠٠" }).data.deduction, 50000);
  assert.equal(checkExpense({ date: "٢٠٢٦-١٠-٠٥", item: "ماء", amount: "١٢٬٠٠٠", category: "GENERAL" }).data.amount, 12000);
});

test("finance access: a معاون sees only the tabs given, writes only where allowed", async () => {
  const { canFinance, financeLevel, parseFinanceAccess, CATEGORY_TAB } = await import("../lib/finance-access.js");

  const deputy = { role: "DEPUTY", financeAccess: JSON.stringify({ salaries: "WRITE", summary: "READ", bogus: "WRITE", box: "ALL" }) };
  assert.deepEqual(parseFinanceAccess(deputy.financeAccess), { salaries: "WRITE", summary: "READ" });
  assert.equal(canFinance(deputy, "salaries", true), true);
  assert.equal(canFinance(deputy, "summary"), true);
  assert.equal(canFinance(deputy, "summary", true), false);
  assert.equal(canFinance(deputy, "box"), false);
  assert.equal(canFinance({ role: "DEPUTY", financeAccess: "not json" }, "summary"), false);
  // Admins have everything; teachers nothing, whatever is stored.
  assert.equal(financeLevel({ role: "ADMIN" }, "box"), "WRITE");
  assert.equal(canFinance({ role: "TEACHER", financeAccess: deputy.financeAccess }, "summary"), false);
  // Every Expense category is kept under some tab.
  const { EXPENSE_CATEGORIES } = await import("../lib/finance.js");
  assert.deepEqual(Object.keys(EXPENSE_CATEGORIES).sort(), Object.keys(CATEGORY_TAB).sort());

  // What the users page sends: "" (لا يراه) drops the tab, anything unknown is refused.
  const { checkFinanceAccess } = await import("../lib/finance-access.js");
  assert.equal(checkFinanceAccess({ summary: "READ", box: "" }).value, '{"summary":"READ"}');
  assert.equal(checkFinanceAccess({}).value, null);
  assert.equal(checkFinanceAccess({ summary: "ADMIN" }).field, "financeAccess");
  assert.equal(checkFinanceAccess({ users: "WRITE" }).field, "financeAccess");
  assert.equal(checkFinanceAccess(["summary"]).field, "financeAccess");
  assert.equal(checkFinanceAccess({ summary: "constructor" }).field, "financeAccess");
  assert.equal(canFinance({ role: "DEPUTY", financeAccess: '{"summary":"constructor"}' }, "summary"), false);
});
