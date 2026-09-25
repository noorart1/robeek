
import { parseAmount } from "./digits";
import { ATTENDANCE_TYPES, PAYMENT_PLANS } from "./labels";
import { parseDay } from "./dates";

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
