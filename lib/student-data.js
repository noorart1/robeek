
import prisma from "./prisma";
import { duesOn } from "./dues";
import { iraqToday } from "./dates";
import { paidTotals } from "./finance";

// What the students table and the edit dialog need for one child.

export const studentSelect = {
  id: true,
  studentCode: true,
  firstName: true,
  fatherName: true,
  grandfatherName: true,
  lastName: true,
  nationalId: true,
  birthDate: true,
  birthYear: true,
  gender: true,
  phone: true,
  address: true,
  emergencyPhone: true,
  photo: true,
  notes: true,
  reviewNote: true,
  status: true,
  transportOrder: true,
  updatedAt: true,

  TransportLine: {
    select: { id: true, name: true, driverPhone: true }
  },

  StudentParent: {
    select: {
      relation: true,
      Parent: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          phone2: true,
          address: true,
          updatedAt: true
        }
      }
    }
  },

  Enrollment: {
    select: {
      id: true,
      enrollmentDate: true,
      status: true,
      tuitionFee: true,
      attendanceType: true,
      paymentPlan: true,
      AcademicYear: {
        select: { id: true, name: true, isActive: true, kind: true }
      },
      Class: {
        select: { id: true, name: true, shift: true, teacherName: true }
      },
      Payment: {
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          paymentType: true,
          paymentMethod: true,
          description: true,
          receiptNo: true,
          voidedAt: true,
          voidReason: true
        },
        orderBy: { paymentDate: "asc" }
      }
    }
  }
};

// One enrollment as the table and the dialog show it: the enrollment with
// its payments, and the money (fee, paid, instalments due, overdue).
function enrollmentView(current, previousDue = []) {
  const payments = current.Payment.map((payment) => ({ ...payment, amount: Number(payment.amount) }));

  // Voided receipts stay listed but never count.
  const paid = paidTotals(payments);
  const tuitionFee = Number(current.tuitionFee);
  const totalPaid = paid.tuition;
  const previousTotal = previousDue.reduce((t, e) => t + e.remaining, 0);

  const dues = duesOn(iraqToday(), {
    tuitionFee,
    paymentPlan: current.paymentPlan,
    enrollmentDate: current.enrollmentDate.toISOString(),
    shift: current.Class.shift,
    yearName: current.AcademicYear.name
  }, totalPaid);

  return {
    enrollment: {
      id: current.id,
      enrollmentDate: current.enrollmentDate,
      status: current.status,
      attendanceType: current.attendanceType,
      paymentPlan: current.paymentPlan,
      academicYear: current.AcademicYear,
      class: current.Class,
      payments
    },
    financial: {
      tuitionFee,
      totalPaid,
      remaining: tuitionFee - totalPaid,
      curriculumPaid: paid.curriculum,
      // Instalments due by today (lib/dues.js) and how far behind.
      expected: dues.expected,
      overdue: dues.overdue + previousTotal,
      previousDue,
      nextDue: dues.nextDue,
      planAssumed: dues.planAssumed,
      currency: "IQD"
    }
  };
}

const noEnrollment = {
  enrollment: null,
  financial: {
    tuitionFee: 0, totalPaid: 0, remaining: 0, curriculumPaid: 0, expected: 0,
    overdue: 0, previousDue: [], nextDue: null, planAssumed: false, currency: "IQD"
  }
};

// view: a year chosen in the header (lib/year-view.js), { yearId,
// summerId }, shown in place of the active ones; null for the active
// year. A summer course chosen on its own is yearId (summerId null).
export function formatStudent(student, view = null) {
  const { StudentParent, Enrollment, TransportLine, ...studentData } = student;

  const father =
    StudentParent.find((item) => item.relation === "FATHER")?.Parent || null;
  const mother =
    StudentParent.find((item) => item.relation === "MOTHER")?.Parent || null;

  const regular = Enrollment.filter((e) => e.AcademicYear.kind !== "SUMMER");

  // The active school year's enrollment first, then the newest; for an
  // earlier year, that year's only.
  const current = view
    ? Enrollment.find((e) => e.AcademicYear.id === view.yearId) || null
    : [...regular].sort((a, b) =>
        a.AcademicYear.isActive !== b.AcademicYear.isActive
          ? a.AcademicYear.isActive ? -1 : 1
          : b.id - a.id
      )[0] || null;

  // الدورة الصيفية runs beside the school year, with its own enrollment.
  const summer = Enrollment.find((e) =>
    view ? e.AcademicYear.id === view.summerId : e.AcademicYear.kind === "SUMMER" && e.AcademicYear.isActive
  ) || null;
  const before = (e) => (view ? e.AcademicYear.id < view.yearId : !e.AcademicYear.isActive);

  // What is still owed from years that are over (earlier school years and
  // past summer courses). It stays on that year's enrollment (paid off by a
  // payment recorded «عن» that year) and counts as overdue. A summer
  // course shown on its own carries only earlier summers'.
  const ownTerm = (e) => current.AcademicYear.kind !== "SUMMER" || e.AcademicYear.kind === "SUMMER";
  const previousDue = current
    ? Enrollment.filter((e) => e.id !== current.id && e.id !== summer?.id && before(e) && ownTerm(e))
        .map((e) => ({
          enrollmentId: e.id,
          year: e.AcademicYear.name,
          remaining: Number(e.tuitionFee) - paidTotals(e.Payment).tuition
        }))
        .filter((e) => e.remaining > 0)
        .sort((a, b) => a.enrollmentId - b.enrollmentId)
    : [];

  return {
    ...studentData,
    father,
    mother,
    transportLine: TransportLine,
    ...(current ? enrollmentView(current, previousDue) : noEnrollment),
    // The summer course's enrollment and money, or null when not enrolled.
    // The table's summer view shows these in place of the school year's.
    summer: summer ? enrollmentView(summer) : null,
    // Years that are over (school years and summers).
    past: Enrollment.filter((e) => !e.AcademicYear.isActive).map((e) => enrollmentView(e))
  };
}


// As the students table shows it, for the year chosen in the header.
export async function loadStudent(id) {
  const { yearView, studentView } = await import("./year-view");
  const [student, view] = await Promise.all([
    prisma.student.findUnique({ where: { id }, select: studentSelect }),
    yearView()
  ]);

  return student ? formatStudent(student, studentView(view)) : null;
}

// The active school year, or with kind "SUMMER" the active summer course.
export async function activeAcademicYear(client = prisma, kind = "REGULAR") {
  return client.academicYear.findFirst({
    where: { isActive: true, kind },
    orderBy: { id: "desc" }
  });
}
