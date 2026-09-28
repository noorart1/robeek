
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
        select: { id: true, name: true, isActive: true }
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

export function formatStudent(student) {
  const { StudentParent, Enrollment, TransportLine, ...studentData } = student;

  const father =
    StudentParent.find((item) => item.relation === "FATHER")?.Parent || null;
  const mother =
    StudentParent.find((item) => item.relation === "MOTHER")?.Parent || null;

  // The active academic year's enrollment first, then the newest.
  const current =
    [...Enrollment].sort((a, b) =>
      a.AcademicYear.isActive !== b.AcademicYear.isActive
        ? a.AcademicYear.isActive ? -1 : 1
        : b.id - a.id
    )[0] || null;

  const payments = current
    ? current.Payment.map((payment) => ({
        ...payment,
        amount: Number(payment.amount)
      }))
    : [];

  // Voided receipts stay listed but never count.
  const paid = paidTotals(payments);

  const tuitionFee = current ? Number(current.tuitionFee) : 0;
  const totalPaid = paid.tuition;

  // What is still owed from earlier school years. It stays on that year's
  // enrollment (paid off by a payment recorded «عن» that year) and counts
  // as overdue.
  const previousDue = current
    ? Enrollment.filter((e) => e.AcademicYear.name < current.AcademicYear.name)
        .map((e) => ({
          enrollmentId: e.id,
          year: e.AcademicYear.name,
          remaining: Number(e.tuitionFee) - paidTotals(e.Payment).tuition
        }))
        .filter((e) => e.remaining > 0)
        .sort((a, b) => a.year.localeCompare(b.year))
    : [];
  const previousTotal = previousDue.reduce((t, e) => t + e.remaining, 0);

  const dues = current
    ? duesOn(iraqToday(), {
        tuitionFee,
        paymentPlan: current.paymentPlan,
        enrollmentDate: current.enrollmentDate.toISOString(),
        shift: current.Class.shift,
        yearName: current.AcademicYear.name
      }, totalPaid)
    : null;

  return {
    ...studentData,
    father,
    mother,
    transportLine: TransportLine,

    enrollment: current
      ? {
          id: current.id,
          enrollmentDate: current.enrollmentDate,
          status: current.status,
          attendanceType: current.attendanceType,
          paymentPlan: current.paymentPlan,
          academicYear: current.AcademicYear,
          class: current.Class,
          payments
        }
      : null,

    financial: {
      tuitionFee,
      totalPaid,
      remaining: tuitionFee - totalPaid,
      curriculumPaid: paid.curriculum,
      // Instalments due by today (lib/dues.js) and how far behind.
      expected: dues?.expected ?? 0,
      overdue: (dues?.overdue ?? 0) + previousTotal,
      previousDue,
      nextDue: dues?.nextDue ?? null,
      planAssumed: dues?.planAssumed ?? false,
      currency: "IQD"
    }
  };
}

export async function loadStudent(id) {
  const student = await prisma.student.findUnique({
    where: { id },
    select: studentSelect
  });

  return student ? formatStudent(student) : null;
}

export async function activeAcademicYear(client = prisma) {
  return client.academicYear.findFirst({
    where: { isActive: true },
    orderBy: { id: "desc" }
  });
}
