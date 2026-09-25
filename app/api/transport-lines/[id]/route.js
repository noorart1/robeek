
import prisma from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { validateLine } from "../../../../lib/transport-lines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message, status, extra = {}) {
  return Response.json(
    { error: message, ...extra },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

async function lineIdFrom(params) {
  const { id } = await params;
  const lineId = Number(id);

  return Number.isSafeInteger(lineId) && lineId > 0 ? lineId : null;
}

// تعديل بيانات السائق: name, driverPhone and/or shift.

export async function PATCH(request, { params }) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "ADMIN") {
      return errorResponse("ليس لديك صلاحية الوصول.", 401);
    }

    const lineId = await lineIdFrom(params);

    if (!lineId) {
      return errorResponse("معرّف الخط غير صالح.", 400);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return errorResponse("البيانات المرسلة غير صالحة.", 400);
    }

    const checked = validateLine(body, { partial: true });

    if (checked.error) {
      return errorResponse(checked.error, 400, { field: checked.field });
    }

    const result = await prisma.transportLine.updateMany({
      where: { id: lineId },
      data: checked.data
    });

    if (result.count === 0) {
      return errorResponse("لم يتم العثور على الخط.", 404);
    }

    return Response.json(
      { line: await prisma.transportLine.findUnique({ where: { id: lineId } }) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Transport line PATCH error:", error);

    return errorResponse("حدث خطأ أثناء حفظ بيانات الخط.", 500);
  }
}

// حذف خط: its riders keep their records and simply have no line
// (the foreign key is ON DELETE SET NULL).

export async function DELETE(request, { params }) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "ADMIN") {
      return errorResponse("ليس لديك صلاحية الوصول.", 401);
    }

    const lineId = await lineIdFrom(params);

    if (!lineId) {
      return errorResponse("معرّف الخط غير صالح.", 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      // Explicit, so it also holds if the constraint were ever missing.
      const riders = await tx.student.updateMany({
        where: { transportLineId: lineId },
        data: { transportLineId: null, transportOrder: null, updatedAt: new Date() }
      });

      const deleted = await tx.transportLine.deleteMany({ where: { id: lineId } });

      return { riders: riders.count, deleted: deleted.count };
    });

    if (result.deleted === 0) {
      return errorResponse("لم يتم العثور على الخط.", 404);
    }

    return Response.json(
      { success: true, unassigned: result.riders },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Transport line DELETE error:", error);

    return errorResponse("حدث خطأ أثناء حذف الخط.", 500);
  }
}
