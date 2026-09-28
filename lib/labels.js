
// Stored codes and their Arabic labels, shared by API routes and components.

export const SHIFTS = { MORNING: "صباحي", EVENING: "مسائي" };

// نوع الدوام: children of employees pay a different fee.
export const ATTENDANCE_TYPES = { REGULAR: "عادي", EMPLOYEE: "موظفين" };

export const PAYMENT_PLANS = { MONTHLY: "شهري", YEARLY: "سنوي" };

// REFUND is money given back to the parents: stored positive, subtracted
// from the tuition paid.
export const PAYMENT_TYPES = { TUITION: "قسط", CURRICULUM: "منهج وزي", REFUND: "استرجاع" };

// نوع الدفع. Older payments have none.
export const PAYMENT_METHODS = { CASH: "نقدي", CARD: "بطاقة" };

// الحضور والغياب, in the order the buttons appear.
export const ATTENDANCE_STATUSES = {
  PRESENT: { label: "حاضر", short: "✓", color: "#15803d", background: "#dcfce7" },
  ABSENT: { label: "غائب", short: "✗", color: "#b91c1c", background: "#fee2e2" },
  LATE: { label: "متأخر", short: "⏱", color: "#b45309", background: "#fef3c7" },
  EXCUSED: { label: "مجاز", short: "م", color: "#1d4ed8", background: "#dbeafe" }
};

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
