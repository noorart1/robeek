import prisma from "../../../../../lib/prisma";
import { getCurrentUser } from "../../../../../lib/auth";
import { toWesternDigits } from "../../../../../lib/digits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const parentSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  phone2: true,
  address: true,
  updatedAt: true
};

function errorResponse(message, status) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

async function checkAdmin() {
  const user = await getCurrentUser();

  return user && user.role === "ADMIN";
}

async function getStudentId(params) {
  const { id } = await params;
  const studentId = Number(id);

  if (
    !Number.isSafeInteger(studentId) ||
    studentId <= 0
  ) {
    return null;
  }

  return studentId;
}

// دریافت اطلاعات والدین کودک

export async function GET(request, { params }) {
  try {
    if (!(await checkAdmin())) {
      return errorResponse(
        "ليس لديك صلاحية الوصول.",
        401
      );
    }

    const studentId = await getStudentId(params);

    if (!studentId) {
      return errorResponse(
        "معرّف الطفل غير صالح.",
        400
      );
    }

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true }
    });

    if (!student) {
      return errorResponse(
        "لم يتم العثور على الطفل.",
        404
      );
    }

    const relations =
      await prisma.studentParent.findMany({
        where: { studentId },
        select: {
          relation: true,
          Parent: {
            select: parentSelect
          }
        }
      });

    return Response.json(
      { parents: relations },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {
    console.error("Parents GET error:", error);

    return errorResponse(
      "حدث خطأ أثناء تحميل بيانات الوالدين.",
      500
    );
  }
}

// ثبت والد جدید یا اتصال والد موجود

export async function POST(request, { params }) {
  try {
    if (!(await checkAdmin())) {
      return errorResponse(
        "ليس لديك صلاحية الوصول.",
        401
      );
    }

    const studentId = await getStudentId(params);

    if (!studentId) {
      return errorResponse(
        "معرّف الطفل غير صالح.",
        400
      );
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return errorResponse(
        "البيانات المرسلة غير صالحة.",
        400
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return errorResponse(
        "البيانات المرسلة غير صالحة.",
        400
      );
    }

    const { relation, parentId } = body;

    if (!["FATHER", "MOTHER"].includes(relation)) {
      return errorResponse(
        "يرجى تحديد صلة القرابة.",
        400
      );
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const student = await tx.student.findUnique({
          where: { id: studentId },
          select: { id: true }
        });

        if (!student) {
          return { error: "STUDENT_NOT_FOUND" };
        }

        const existingRelation =
          await tx.studentParent.findFirst({
            where: {
              studentId,
              relation
            }
          });

        if (existingRelation) {
          return { error: "RELATION_EXISTS" };
        }

        let parent;

        // اتصال والد ثبت‌شده

        if (parentId !== undefined) {
          if (
            !Number.isSafeInteger(parentId) ||
            parentId <= 0
          ) {
            return { error: "INVALID_PARENT" };
          }

          parent = await tx.parent.findUnique({
            where: { id: parentId }
          });

          if (!parent) {
            return { error: "PARENT_NOT_FOUND" };
          }

          const existingLink =
            await tx.studentParent.findUnique({
              where: {
                studentId_parentId: {
                  studentId,
                  parentId
                }
              }
            });

          if (existingLink) {
            return { error: "ALREADY_LINKED" };
          }

        } else {
          // ایجاد والد جدید

          const firstName =
            typeof body.firstName === "string"
              ? body.firstName.trim()
              : "";

          const lastName =
            typeof body.lastName === "string"
              ? body.lastName.trim()
              : "";

          const phone =
            typeof body.phone === "string"
              ? toWesternDigits(body.phone.trim())
              : "";

          if (
            !firstName ||
            !lastName ||
            firstName.length > 100 ||
            lastName.length > 100 ||
            phone.length > 30
          ) {
            return { error: "INVALID_DATA" };
          }

          if (
            phone &&
            !/^[+]?[0-9\s()-]{7,30}$/.test(phone)
          ) {
            return { error: "INVALID_PHONE" };
          }

          parent = await tx.parent.create({
            data: {
              firstName,
              lastName,
              phone: phone || null,
              updatedAt: new Date()
            }
          });
        }

        await tx.studentParent.create({
          data: {
            studentId,
            parentId: parent.id,
            relation
          }
        });

        return {
          success: true,
          parent: await tx.parent.findUnique({
            where: { id: parent.id },
            select: parentSelect
          })
        };
      }
    );

    const errors = {
      STUDENT_NOT_FOUND: [
        "لم يتم العثور على الطفل.",
        404
      ],
      RELATION_EXISTS: [
        "تم تسجيل هذا الوالد أو الوالدة مسبقاً لهذا الطفل.",
        409
      ],
      INVALID_PARENT: [
        "معرّف ولي الأمر غير صالح.",
        400
      ],
      PARENT_NOT_FOUND: [
        "لم يتم العثور على ولي الأمر.",
        404
      ],
      ALREADY_LINKED: [
        "ولي الأمر مرتبط بهذا الطفل مسبقاً.",
        409
      ],
      INVALID_DATA: [
        "يرجى إدخال اسم الوالد ولقبه بصورة صحيحة.",
        400
      ],
      INVALID_PHONE: [
        "رقم الهاتف غير صالح.",
        400
      ]
    };

    if (result.error) {
      const [message, status] = errors[result.error];

      return errorResponse(message, status);
    }

    return Response.json(
      result,
      {
        status: 201,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {
    if (error.code === "P2002") {
      return errorResponse(
        "تم تسجيل هذا الارتباط مسبقاً.",
        409
      );
    }

    console.error("Parents POST error:", error);

    return errorResponse(
      "حدث خطأ أثناء حفظ بيانات الوالدين.",
      500
    );
  }
}
