import prisma from "../../../../lib/prisma";
import { requireAdmin } from "../../../../lib/auth";
import { toWesternDigits } from "../../../../lib/digits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const editableFields = {
  firstName: 100,
  lastName: 100,
  phone: 30,
  phone2: 30,
  address: 500
};

// Names may be blank: many mothers are known only by phone number.
const requiredFields = [];

function errorResponse(message, status, extra = {}) {
  return Response.json(
    { error: message, ...extra },
    {
      status,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

const parentSelect = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  phone2: true,
  address: true,
  updatedAt: true
};

export async function PATCH(request, { params }) {
  try {
    const { user, response } = await requireAdmin();
    if (response) return response;

    const { id } = await params;
    const parentId = Number(id);

    if (
      !Number.isSafeInteger(parentId) ||
      parentId <= 0
    ) {
      return errorResponse(
        "معرّف ولي الأمر غير صالح.",
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

    const { field, value, updatedAt } = body;

    if (
      typeof field !== "string" ||
      !Object.prototype.hasOwnProperty.call(
        editableFields,
        field
      )
    ) {
      return errorResponse(
        "الحقل المحدد غير قابل للتعديل.",
        400
      );
    }

    if (
      typeof value !== "string" ||
      value.length > editableFields[field]
    ) {
      return errorResponse(
        "القيمة المدخلة غير صالحة.",
        400
      );
    }

    const trimmedValue = ["phone", "phone2"].includes(field)
      ? toWesternDigits(value.trim())
      : value.trim();

    if (
      requiredFields.includes(field) &&
      !trimmedValue
    ) {
      return errorResponse(
        "هذا الحقل مطلوب.",
        400
      );
    }

    if (
      ["phone", "phone2"].includes(field) &&
      trimmedValue &&
      !/^[+]?[0-9\s()-]{7,30}$/.test(trimmedValue)
    ) {
      return errorResponse(
        "رقم الهاتف غير صالح.",
        400
      );
    }

    if (
      typeof updatedAt !== "string" ||
      !updatedAt ||
      !Number.isFinite(Date.parse(updatedAt))
    ) {
      return errorResponse(
        "إصدار البيانات غير صالح. يرجى تحديث الجدول.",
        400
      );
    }

    const expectedUpdatedAt = new Date(updatedAt);

    const newValue =
      !trimmedValue &&
      !requiredFields.includes(field)
        ? null
        : trimmedValue;

    const result = await prisma.parent.updateMany({
      where: {
        id: parentId,
        updatedAt: expectedUpdatedAt
      },
      data: {
        [field]: newValue,
        updatedAt: new Date()
      }
    });

    if (result.count === 0) {
      const currentParent =
        await prisma.parent.findUnique({
          where: { id: parentId },
          select: parentSelect
        });

      if (!currentParent) {
        return errorResponse(
          "لم يتم العثور على ولي الأمر.",
          404
        );
      }

      return errorResponse(
        "تم تعديل بيانات ولي الأمر. يرجى تحديث الجدول.",
        409,
        {
          code: "EDIT_CONFLICT",
          parent: currentParent
        }
      );
    }

    const parent = await prisma.parent.findUnique({
      where: { id: parentId },
      select: parentSelect
    });

    return Response.json(
      {
        success: true,
        parent
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {
    console.error("Parent PATCH error:", error);

    return errorResponse(
      "حدث خطأ أثناء حفظ بيانات ولي الأمر.",
      500
    );
  }
}
