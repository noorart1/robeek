
// Stored codes and their Arabic labels, shared by API routes and components.

export const SHIFTS = { MORNING: "صباحي", EVENING: "مسائي" };

// نوع الدوام: children of employees pay a different fee.
export const ATTENDANCE_TYPES = { REGULAR: "عادي", EMPLOYEE: "موظفين" };

export const PAYMENT_PLANS = { MONTHLY: "شهري", YEARLY: "سنوي" };

// Refunds are money given back to the parents: stored positive, and
// subtracted from what they refund (lib/finance.js paidTotals).
export const PAYMENT_TYPES = {
  TUITION: "قسط",
  CURRICULUM: "منهج وزي",
  REFUND: "استرجاع قسط",
  CURRICULUM_REFUND: "استرجاع منهج وزي"
};

// دفعات الرواتب: REFUND is money the person gives back.
export const SALARY_PAYMENT_TYPES = { SALARY: "راتب", REFUND: "استرجاع" };

// نوع الدفع. Older payments have none.
export const PAYMENT_METHODS = { CASH: "نقدي", CARD: "بطاقة" };

// الحضور والغياب, in the order the buttons appear.
export const ATTENDANCE_STATUSES = {
  PRESENT: { label: "حاضر", short: "✓", color: "#15803d", background: "#dcfce7" },
  ABSENT: { label: "غائب", short: "✗", color: "#b91c1c", background: "#fee2e2" },
  LATE: { label: "متأخر", short: "⏱", color: "#b45309", background: "#fef3c7" },
  EXCUSED: { label: "مجاز", short: "م", color: "#1d4ed8", background: "#dbeafe" }
};

export const GENDERS = { MALE: "ذكر", FEMALE: "أنثى" };

// A summer course is named «صيف 2026» (AcademicYear.kind SUMMER).
export const summerYearName = (year) => `صيف ${year}`;
// The summer that can be started on `today`: this year's until August,
// then next year's, so registration can open months ahead.
export const upcomingSummerName = (today) =>
  summerYearName(Number(today.slice(0, 4)) + (today.slice(5, 7) >= "09" ? 1 : 0));
export const isSummerYear = (name) => /^صيف \d{4}$/.test(name || "");

// «السنة الدراسية 2025-2026» or «الدورة الصيفية 2026».
export function yearLabel(name) {
  return isSummerYear(name) ? `الدورة الصيفية ${name.slice(4)}` : `السنة الدراسية ${name || ""}`.trim();
}

export function classLabel(cls) {
  return cls ? `${SHIFTS[cls.shift] || cls.shift || ""} ${cls.name}`.trim() : "";
}

export function attendanceLabel(enrollment) {
  if (!enrollment) return "";
  return [
    ATTENDANCE_TYPES[enrollment.attendanceType],
    PAYMENT_PLANS[enrollment.paymentPlan]
  ]
    .filter(Boolean)
    .join(" - ");
}

// Iraqi full name: الاسم + الأب + الجد (+ اللقب).
export function fullName(student) {
  return [
    student.firstName,
    student.fatherName,
    student.grandfatherName,
    student.lastName
  ]
    .filter(Boolean)
    .join(" ");
}

export function parentName(parent) {
  return parent
    ? [parent.firstName, parent.lastName].filter(Boolean).join(" ")
    : "";
}

// Iraqi dinars have no fractional unit in practice; Western digits with
// thousands separators, as in the school's own spreadsheets.
export function formatMoney(value) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.round(number).toLocaleString("en-US")
    : "";
}
