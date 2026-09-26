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
