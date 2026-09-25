
import prisma from "../../../lib/prisma";
import { getCurrentUser } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// اطلاعات کودک و ارتباطات او

const studentSelect = {
  id: true,
  studentCode: true,
  firstName: true,
  lastName: true,
  fatherName: true,
  nationalId: true,
  birthDate: true,
  gender: true,
  phone: true,
  address: true,
  emergencyPhone: true,
  photo: true,
  notes: true,
  status: true,
  updatedAt: true,

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

      AcademicYear: {
        select: {
          id: true,
          name: true,
          isActive: true
        }
      },

      Class: {
        select: {
          id: true,
          name: true,
          grade: true,
          shift: true
        }
      },

      Payment: {
        select: {
          id: true,
          amount: true,
          paymentDate: true,
          paymentType: true,
          receiptNo: true
        }
      }
    }
  }
};

// بررسی دسترسی مدیر

async function checkAdmin() {
  const user = await getCurrentUser();

  return Boolean(
    user &&
    user.role === "ADMIN"
  );
}

// تبدیل اطلاعات کودک به ساختار جدول جامع

function formatStudent(student) {

  const {
    StudentParent,
    Enrollment,
    ...studentData
  } = student;

  // شناسایی پدر و مادر

  const fatherRelation = StudentParent.find(
    item => item.relation === "FATHER"
  );

  const motherRelation = StudentParent.find(
    item => item.relation === "MOTHER"
  );

  const father = fatherRelation?.Parent || null;
  const mother = motherRelation?.Parent || null;

  // مرتب‌سازی ثبت‌نام‌ها

  const enrollments = [...Enrollment].sort(
    (a, b) => {
      if (
        a.AcademicYear.isActive !==
        b.AcademicYear.isActive
      ) {
        return a.AcademicYear.isActive ? -1 : 1;
      }

      return b.id - a.id;
    }
  );

  // ثبت‌نام سال تحصیلی فعال در اولویت است

  const currentEnrollment =
    enrollments[0] || null;

  let totalPaid = 0;
  let tuitionFee = 0;

  if (currentEnrollment) {

    tuitionFee = Number(
      currentEnrollment.tuitionFee
    );

    totalPaid = currentEnrollment.Payment.reduce(
      (sum, payment) =>
        sum + Number(payment.amount),
      0
    );
  }

  const remaining =
    tuitionFee - totalPaid;

  return {
    ...studentData,

    father,
    mother,

    enrollment: currentEnrollment
      ? {
          id: currentEnrollment.id,

          enrollmentDate:
            currentEnrollment.enrollmentDate,

          status:
            currentEnrollment.status,

          academicYear:
            currentEnrollment.AcademicYear,

          class:
            currentEnrollment.Class
        }
      : null,

    financial: {
      tuitionFee,
      totalPaid,
      remaining,
      currency: "IQD"
    }
  };
}

// دریافت فهرست کودکان

export async function GET() {
  try {

    const authorized = await checkAdmin();

    if (!authorized) {
      return Response.json(
        {
          error: "ليس لديك صلاحية الوصول."
        },
        {
          status: 401,
          headers: {
            "Cache-Control": "no-store"
          }
        }
      );
    }

    const students = await prisma.student.findMany({
      select: studentSelect,

      orderBy: {
        id: "desc"
      },

      take: 100
    });

    const formattedStudents =
      students.map(formatStudent);

    return Response.json(
      {
        students: formattedStudents
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {

    console.error(
      "Students GET error:",
      error
    );

    return Response.json(
      {
        error:
          "حدث خطأ أثناء تحميل بيانات الأطفال."
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  }
}

// ثبت کودک جدید

export async function POST(request) {
  try {

    const authorized = await checkAdmin();

    if (!authorized) {
      return Response.json(
        {
          error: "ليس لديك صلاحية الوصول."
        },
        { status: 401 }
      );
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return Response.json(
        {
          error: "البيانات المرسلة غير صالحة."
        },
        { status: 400 }
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return Response.json(
        {
          error: "البيانات المرسلة غير صالحة."
        },
        { status: 400 }
      );
    }

    const studentCode =
      typeof body.studentCode === "string"
        ? body.studentCode.trim()
        : "";

    const firstName =
      typeof body.firstName === "string"
        ? body.firstName.trim()
        : "";

    const lastName =
      typeof body.lastName === "string"
        ? body.lastName.trim()
        : "";

    if (
      !studentCode ||
      !firstName ||
      !lastName ||
      studentCode.length > 50 ||
      firstName.length > 100 ||
      lastName.length > 100
    ) {
      return Response.json(
        {
          error:
            "رمز الطفل والاسم واللقب حقول مطلوبة."
        },
        { status: 400 }
      );
    }

    const student = await prisma.student.create({
      data: {
        studentCode,
        firstName,
        lastName,
        updatedAt: new Date()
      },

      select: studentSelect
    });

    return Response.json(
      {
        student: formatStudent(student)
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {

    if (error.code === "P2002") {
      return Response.json(
        {
          error:
            "رمز الطفل مسجل مسبقاً."
        },
        { status: 409 }
      );
    }

    console.error(
      "Students POST error:",
      error
    );

    return Response.json(
      {
        error:
          "حدث خطأ أثناء تسجيل الطفل."
      },
      { status: 500 }
    );
  }
}