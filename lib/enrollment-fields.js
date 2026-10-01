
import { parseAmount } from "./digits.js";
import { ATTENDANCE_TYPES, PAYMENT_PLANS } from "./labels.js";
import { iraqToday, parseDay } from "./dates.js";

// Validation for a child's registration in a section, shared by creating
// a child and PUT /api/students/[id]/enrollment.
// Returns { data } ready for Prisma (classId, tuitionFee, attendanceType,
// paymentPlan and, when given, enrollmentDate), or { error, field }.

export function validateEnrollment(body) {
  const classId = Number(body?.classId);

  if (!Number.isSafeInteger(classId) || classId <= 0) {
    return { error: "يرجى اختيار الشعبة.", field: "classId" };
  }

  const tuitionFee =
    body.tuitionFee === "" || body.tuitionFee === undefined || body.tuitionFee === null
      ? 0
      : parseAmount(body.tuitionFee);

  if (tuitionFee === null) {
    return { error: "يرجى إدخال المبلغ الإجمالي بالأرقام.", field: "tuitionFee" };
  }

  const attendanceType = body.attendanceType || null;
  const paymentPlan = body.paymentPlan || null;

  if (attendanceType && !(attendanceType in ATTENDANCE_TYPES)) {
    return { error: "نوع الدوام غير صالح.", field: "attendanceType" };
  }

  if (paymentPlan && !(paymentPlan in PAYMENT_PLANS)) {
    return { error: "طريقة الدفع غير صالحة.", field: "paymentPlan" };
  }

  const data = { classId, tuitionFee, attendanceType, paymentPlan };

  if (body.enrollmentDate) {
    const enrollmentDate = parseDay(String(body.enrollmentDate));

    if (!enrollmentDate) {
      return { error: "تاريخ المباشرة غير صالح.", field: "enrollmentDate" };
    }

    data.enrollmentDate = enrollmentDate;
  }

  return { data };
}

// The start date for a registration that gave none: today, or the term's
// first day when registering ahead of it, so instalments (lib/dues.js) do
// not start months before the child does. School year "2026-2027": 1
// October (morning) / 1 November (evening) 2026; «صيف 2026»: 1 May 2026.
export function defaultEnrollmentDate(yearName, shift, today = iraqToday()) {
  const summer = /^صيف (\d{4})$/.exec(yearName || "");
  const school = /^(\d{4})\s*-\s*\d{4}$/.exec(yearName || "");
  const first = summer
    ? `${summer[1]}-05-01`
    : school
      ? `${school[1]}-${shift === "EVENING" ? "11" : "10"}-01`
      : today;

  return parseDay(today > first ? today : first);
}
