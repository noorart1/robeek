// The money route handlers, called in-process against the local database:
// POST /api/students/[id]/payments, PATCH /api/payments/[id],
// POST /api/salaries/payments, PATCH /api/salaries/payments/[id].
//
// Runs only when .env points at the local copy (school_dev on 127.0.0.1,
// as scripts/local.sh sync requires), so it can never touch production;
// otherwise every test is skipped. Start the database first
// (scripts\db.cmd). Each run creates its own admin, child and staff
// member, and removes them, their payments and the receipt numbers they
// took when it ends.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createRequire, registerHooks } from "node:module";

const require = createRequire(import.meta.url);
require("dotenv").config();

const local = /@(127\.0\.0\.1|localhost)(:\d+)?\/school_dev\b/.test(process.env.DATABASE_URL || "");
const skip = local ? false : "needs .env pointing at school_dev on 127.0.0.1";

// Plain Node runs the route files as Next.js would: imports without ".js",
// and next/headers + next/navigation as small stand-ins (the session
// cookie comes from `jar`).
const jar = new Map();
globalThis.__routeTestJar = jar;
const fakes = {
  "next/headers": `export async function cookies() {
    const jar = globalThis.__routeTestJar;
    return {
      get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
      set: (name, value) => { jar.set(name, value); },
      delete: (name) => { jar.delete(name); }
    };
  }`,
  "next/navigation": "export function redirect(to) { throw new Error(`redirect ${to}`); }"
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier in fakes) return { url: `file:///__fake__/${specifier}.mjs`, shortCircuit: true };
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?js$/.test(specifier)) {
      try {
        return nextResolve(`${specifier}.js`, context);
      } catch {}
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    const fake = /^file:\/\/\/__fake__\/(.+)\.mjs$/.exec(url);
    if (fake) return { format: "module", source: fakes[fake[1]], shortCircuit: true };
    return nextLoad(url, context);
  }
});

const route = (path) => import(new URL(`../app/api/${path}/route.js`, import.meta.url));
const call = async (handler, method, body, id) => {
  const response = await handler(
    new Request("http://localhost/api", {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    }),
    { params: Promise.resolve({ id: String(id) }) }
  );
  return { status: response.status, body: await response.json() };
};

let prisma, studentPayments, paymentVoid, salaryPayments, salaryVoid;
const made = {};
let counters = [];
const month = "2026-10";

before(async () => {
  if (skip) return;
  prisma = require("../lib/prisma");
  [studentPayments, paymentVoid, salaryPayments, salaryVoid] = await Promise.all([
    route("students/[id]/payments"),
    route("payments/[id]"),
    route("salaries/payments"),
    route("salaries/payments/[id]")
  ]);

  counters = await prisma.sequence.findMany();
  const now = new Date();
  const tag = `zz-route-test-${randomBytes(3).toString("hex")}`;

  made.admin = await prisma.user.create({
    data: { username: tag, fullName: tag, role: "ADMIN", passwordHash: "-", updatedAt: now }
  });
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      id: tag,
      userId: made.admin.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 3600e3)
    }
  });
  made.token = token;

  const year = await prisma.academicYear.findFirst({ where: { kind: "REGULAR", isActive: true } });
  const cls = await prisma.class.findFirst({ where: { academicYearId: year.id } });
  made.year = year;
  made.student = await prisma.student.create({
    data: { studentCode: tag, firstName: "اختبار", updatedAt: now }
  });
  made.enrollment = await prisma.enrollment.create({
    data: {
      studentId: made.student.id, classId: cls.id, academicYearId: year.id,
      tuitionFee: 1000000, paymentPlan: "YEARLY"
    }
  });
  made.staff = await prisma.staff.create({
    data: { name: tag, baseSalary: 500000, updatedAt: now }
  });
});

after(async () => {
  if (skip) return;
  await prisma.payment.deleteMany({ where: { enrollmentId: made.enrollment.id } });
  await prisma.enrollment.deleteMany({ where: { id: made.enrollment.id } });
  await prisma.student.deleteMany({ where: { id: made.student.id } });
  await prisma.salaryPayment.deleteMany({ where: { Salary: { staffId: made.staff.id } } });
  await prisma.salary.deleteMany({ where: { staffId: made.staff.id } });
  await prisma.staff.deleteMany({ where: { id: made.staff.id } });
  await prisma.session.deleteMany({ where: { userId: made.admin.id } });
  await prisma.user.deleteMany({ where: { id: made.admin.id } });
  // Give back the receipt numbers this run took.
  const before = new Map(counters.map((c) => [c.name, c.value]));
  for (const c of await prisma.sequence.findMany()) {
    if (!before.has(c.name)) await prisma.sequence.delete({ where: { name: c.name } });
    else if (before.get(c.name) !== c.value) await prisma.sequence.update({ where: { name: c.name }, data: { value: before.get(c.name) } });
  }
  await prisma.$disconnect();
});

const signedIn = () => jar.set("school_session", made.token);
const signedOut = () => jar.clear();

test("payments: only an admin may record or void one", { skip }, async () => {
  signedOut();
  assert.equal((await call(studentPayments.POST, "POST", { amount: 1000 }, made.student.id)).status, 401);
  assert.equal((await call(paymentVoid.PATCH, "PATCH", { void: true }, 1)).status, 401);
});

test("payments: Arabic digits, a numbered receipt, refunds within what was paid, voiding", { skip }, async () => {
  signedIn();
  const prefix = made.year.name.replace(/^\d\d(\d\d)-\d\d(\d\d)$/, "$1$2");

  const bad = await call(studentPayments.POST, "POST", { amount: "abc" }, made.student.id);
  assert.equal(bad.status, 400);
  assert.equal(bad.body.field, "amount");

  const paid = await call(studentPayments.POST, "POST", { amount: "٢٥٠٬٠٠٠", paymentMethod: "CASH" }, made.student.id);
  assert.equal(paid.status, 201);
  assert.match(paid.body.payment.receiptNo, new RegExp(`^${prefix}-\\d{4}$`));
  assert.equal(paid.body.student.financial.totalPaid, 250000);
  assert.equal(paid.body.student.financial.remaining, 750000);

  const tooMuch = await call(studentPayments.POST, "POST", { amount: 300000, paymentType: "REFUND" }, made.student.id);
  assert.equal(tooMuch.status, 400);
  const refund = await call(studentPayments.POST, "POST", { amount: 50000, paymentType: "REFUND" }, made.student.id);
  assert.equal(refund.status, 201);
  assert.equal(refund.body.student.financial.totalPaid, 200000);

  const voided = await call(paymentVoid.PATCH, "PATCH", { void: true, reason: "اختبار" }, paid.body.payment.id);
  assert.equal(voided.status, 200);
  assert.equal(voided.body.student.financial.totalPaid, -50000);
  assert.equal((await call(paymentVoid.PATCH, "PATCH", { void: true }, paid.body.payment.id)).status, 409);

  // The voided receipt keeps its number and stays listed.
  const kept = await prisma.payment.findUnique({ where: { id: paid.body.payment.id } });
  assert.equal(kept.receiptNo, paid.body.payment.receiptNo);
  assert.ok(kept.voidedAt);
});

test("payments: a receipt is edited under its own number, within the refund rule", { skip }, async () => {
  signedIn();
  const paid = await call(studentPayments.POST, "POST", { amount: 100000 }, made.student.id);
  const id = paid.body.payment.id;
  const edit = (body) => call(paymentVoid.PATCH, "PATCH", {
    amount: 100000, paymentType: "TUITION", paymentMethod: "CASH", paymentDate: "2026-09-01", ...body
  }, id);

  assert.equal((await edit({ amount: "abc" })).status, 400);
  assert.equal((await edit({ paymentDate: "2026-02-30" })).body.field, "paymentDate");

  const edited = await edit({ amount: "١٥٠٬٠٠٠", paymentMethod: "CARD", description: "تصحيح" });
  assert.equal(edited.status, 200);
  const row = await prisma.payment.findUnique({ where: { id } });
  assert.equal(Number(row.amount), 150000);
  assert.equal(row.paymentMethod, "CARD");
  assert.equal(row.description, "تصحيح");
  assert.equal(row.receiptNo, paid.body.payment.receiptNo);
  assert.equal(row.paymentDate.toISOString().slice(0, 10), "2026-09-01");

  // Refund everything paid so far: cutting this receipt now is refused.
  const { paidTotals } = await import("../lib/finance.js");
  const paidNow = paidTotals(await prisma.payment.findMany({ where: { enrollmentId: made.enrollment.id } })).tuition;
  assert.equal((await call(studentPayments.POST, "POST", { amount: paidNow, paymentType: "REFUND" }, made.student.id)).status, 201);
  assert.equal((await edit({ amount: 149000 })).status, 400);
  assert.equal((await edit({ amount: 160000 })).status, 200);

  assert.equal((await call(paymentVoid.PATCH, "PATCH", { void: true }, id)).status, 200);
  assert.equal((await edit({})).status, 409);
});

test("payments: saved at the same moment, they never share a receipt number", { skip }, async () => {
  signedIn();
  const results = await Promise.all(
    Array.from({ length: 8 }, () => call(studentPayments.POST, "POST", { amount: 1000 }, made.student.id))
  );
  assert.deepEqual(results.map((r) => r.status), Array(8).fill(201));
  const numbers = results.map((r) => Number(r.body.payment.receiptNo.split("-")[1])).sort((a, b) => a - b);
  assert.equal(new Set(numbers).size, 8);
  assert.equal(numbers[7] - numbers[0], 7);
});

test("salary payments: only an admin may record or void one", { skip }, async () => {
  signedOut();
  assert.equal((await call(salaryPayments.POST, "POST", { staffId: made.staff.id, month, amount: 1000 })).status, 401);
  assert.equal((await call(salaryVoid.PATCH, "PATCH", { void: true }, 1)).status, 401);
});

test("salary payments: within the salary, bonuses on top, refunds within what was paid", { skip }, async () => {
  signedIn();
  const pay = (body) => call(salaryPayments.POST, "POST", { staffId: made.staff.id, month, ...body });

  const first = await pay({ amount: "٣٠٠٬٠٠٠" });
  assert.equal(first.status, 201);
  assert.match(first.body.payment.receiptNo, /^S-\d{4}$/);

  // 500,000 due, 300,000 paid: 200,000 left.
  const over = await pay({ amount: 250000 });
  assert.equal(over.status, 400);
  assert.equal(over.body.field, "amount");

  assert.equal((await pay({ amount: 400000, paymentType: "BONUS" })).status, 201);
  assert.equal((await pay({ amount: 200000 })).status, 201);

  assert.equal((await pay({ amount: 600000, paymentType: "REFUND" })).status, 400);
  const refund = await pay({ amount: 50000, paymentType: "REFUND" });
  assert.equal(refund.status, 201);

  const salary = await prisma.salary.findUnique({
    where: { staffId_month: { staffId: made.staff.id, month } },
    include: { SalaryPayment: true }
  });
  const { salaryPaid } = await import("../lib/staff.js");
  assert.equal(salaryPaid(salary.SalaryPayment), 450000);

  // Voiding the first payment still leaves more paid (200,000) than
  // refunded (50,000), so it is allowed; voiding it twice is not.
  assert.equal((await call(salaryVoid.PATCH, "PATCH", { void: true }, first.body.payment.id)).status, 200);
  assert.equal((await call(salaryVoid.PATCH, "PATCH", { void: true }, first.body.payment.id)).status, 409);
});

// A summer course chosen on its own (lib/year-view.js) is the child's
// enrollment, and carries no debt of the school year.
test("formatStudent: a summer course on its own leaves the school year out", async () => {
  const { formatStudent } = await import("../lib/student-data.js");
  const year = (id, name, kind, isActive) => ({ id, name, kind, isActive });
  const enrollment = (id, AcademicYear, fee, paid) => ({
    id, AcademicYear, tuitionFee: fee, paymentPlan: "YEARLY", enrollmentDate: new Date("2025-10-01"),
    status: "ACTIVE", attendanceType: null, Class: { id, name: "A", shift: "MORNING" },
    Payment: paid ? [{ amount: paid, paymentType: "TUITION", voidedAt: null }] : []
  });
  const student = {
    id: 1, StudentParent: [], TransportLine: null,
    Enrollment: [
      enrollment(1, year(1, "2024-2025", "REGULAR", false), 900000, 0),
      enrollment(2, year(2, "صيف 2025", "SUMMER", false), 200000, 0),
      enrollment(3, year(3, "2025-2026", "REGULAR", true), 1000000, 0),
      enrollment(4, year(4, "صيف 2026", "SUMMER", true), 300000, 100000)
    ]
  };

  const summer = formatStudent(student, { yearId: 4, summerId: null });
  assert.equal(summer.enrollment.id, 4);
  assert.equal(summer.summer, null);
  assert.equal(summer.financial.remaining, 200000);
  // Only the earlier summer's debt, never a school year's.
  assert.deepEqual(summer.financial.previousDue.map((d) => d.year), ["صيف 2025"]);

  const school = formatStudent(student, { yearId: 3, summerId: 4 });
  assert.equal(school.enrollment.id, 3);
  assert.equal(school.summer.enrollment.id, 4);
});
