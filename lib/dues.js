
// How much of a child's tuition should have been paid by a given day.
//
// The school's rules (from its 2025-2026 workbook):
// - MONTHLY: the year's fee in equal instalments, one per school month
//   from the child's start month to May (morning from October, evening
//   from November — 8 and 7 months for a full year). The first falls due
//   on the start date, the rest on the 1st of each month.
// - YEARLY: two halves, on the start date and 4½ months later.
// - No plan recorded: treated as MONTHLY, and reported as assumed.
//
// Days are "YYYY-MM-DD" strings (lib/dates.js), compared as strings.

const LAST_MONTH = 5; // May

const pad = (n) => String(n).padStart(2, "0");

function addMonths(day, months, extraDays = 0) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, d + extraDays));
  return date.toISOString().slice(0, 10);
}

// The school year's end: May of the second year in "2025-2026".
function endOfYear(yearName, startDay) {
  const match = /^(\d{4})\s*-\s*(\d{4})$/.exec(yearName || "");
  const endYear = match ? Number(match[2]) : Number(startDay.slice(0, 4)) + (Number(startDay.slice(5, 7)) >= 8 ? 1 : 0);
  return `${endYear}-${pad(LAST_MONTH)}-31`;
}

// Due dates for one enrollment, each with the amount falling due then.
export function dueSchedule({ tuitionFee, paymentPlan, enrollmentDate, shift, yearName }) {
  const fee = Number(tuitionFee) || 0;
  const start = String(enrollmentDate).slice(0, 10);

  if (!fee || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return { plan: paymentPlan, dates: [] };

  if (paymentPlan === "YEARLY") {
    const half = Math.round(fee / 2);
    return {
      plan: "YEARLY",
      dates: [
        { day: start, amount: half },
        { day: addMonths(start, 4, 15), amount: fee - half }
      ]
    };
  }

  // Monthly: the start date, then the 1st of each following month until
  // May. A child who started late pays the (already reduced) fee in equal
  // parts over the months that remain.
  const end = endOfYear(yearName, start);
  const firstMonth = `${start.slice(0, 7)}-01`;
  const days = [start];

  for (let next = addMonths(firstMonth, 1); next <= end; next = addMonths(next, 1)) {
    days.push(next);
  }

  const each = Math.round(fee / days.length);

  return {
    plan: "MONTHLY",
    assumed: paymentPlan !== "MONTHLY",
    dates: days.map((day, i) => ({
      day,
      // The last instalment absorbs rounding so the total is exact.
      amount: i === days.length - 1 ? fee - each * (days.length - 1) : each
    }))
  };
}

// { expected, paid, overdue, nextDue, installments } as of `today`.
export function duesOn(today, enrollment, paid) {
  const schedule = dueSchedule(enrollment);
  const dueSoFar = schedule.dates.filter((d) => d.day <= today);
  const expected = dueSoFar.reduce((sum, d) => sum + d.amount, 0);
  const next = schedule.dates.find((d) => d.day > today) || null;

  return {
    plan: schedule.plan,
    planAssumed: Boolean(schedule.assumed),
    installments: schedule.dates.length,
    installmentAmount: schedule.dates[0]?.amount ?? 0,
    expected,
    paid,
    overdue: Math.max(0, expected - paid),
    nextDue: next
  };
}
