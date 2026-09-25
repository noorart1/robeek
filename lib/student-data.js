
import prisma from "./prisma";

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
          description: true
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

  const sum = (type) =>
    payments
      .filter((payment) => (payment.paymentType || "TUITION") === type)
      .reduce((total, payment) => total + payment.amount, 0);

  const tuitionFee = current ? Number(current.tuitionFee) : 0;
  const totalPaid = sum("TUITION");

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
      curriculumPaid: sum("CURRICULUM"),
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
