
// Stored codes and their Arabic labels, shared by API routes and components.

export const SHIFTS = { MORNING: "صباحي", EVENING: "مسائي" };

// نوع الدوام: children of employees pay a different fee.
export const ATTENDANCE_TYPES = { REGULAR: "عادي", EMPLOYEE: "موظفين" };

export const PAYMENT_PLANS = { MONTHLY: "شهري", YEARLY: "سنوي" };

export const PAYMENT_TYPES = { TUITION: "قسط", CURRICULUM: "منهج وزي" };

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
