
import prisma from "../../../../../lib/prisma";
import { getCurrentUser } from "../../../../../lib/auth";
import { validateRiders } from "../../../../../lib/transport-lines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message, status) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

// أطفال الخط بترتيب الاستلام: the body lists every rider of the line, in
// pickup order. Children left out lose the line; children listed from
// another line move to this one.
// ponytail: whole-list replace, last writer wins between two admins
// editing the same line at once; send add/remove operations if that bites.

export async function PUT(request, { params }) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "ADMIN") {
      return errorResponse("ليس لديك صلاحية الوصول.", 401);
    }

    const { id } = await params;
    const lineId = Number(id);

    if (!Number.isSafeInteger(lineId) || lineId <= 0) {
      return errorResponse("معرّف الخط غير صالح.", 400);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return errorResponse("البيانات المرسلة غير صالحة.", 400);
    }

    const checked = validateRiders(body);

    if (checked.error) {
      return errorResponse(checked.error, 400);
    }

    const ids = checked.studentIds;

    const result = await prisma.$transaction(async (tx) => {
      const line = await tx.transportLine.findUnique({ where: { id: lineId } });

      if (!line) return { status: 404 };

      const students = await tx.student.findMany({
        where: { id: { in: ids } },
        select: { id: true, transportLineId: true, transportOrder: true }
      });

      if (students.length !== ids.length) return { status: 400 };

      const now = new Date();

      await tx.student.updateMany({
        where: { transportLineId: lineId, id: { notIn: ids } },
        data: { transportLineId: null, transportOrder: null, updatedAt: now }
      });

      const current = new Map(students.map((s) => [s.id, s]));

      // Only rows that change, so a reorder does not bump updatedAt (and
      // cause edit conflicts in the students table) for everyone else.
      for (const [index, studentId] of ids.entries()) {
        const student = current.get(studentId);

        if (student.transportLineId === lineId && student.transportOrder === index + 1) {
          continue;
        }

        await tx.student.update({
          where: { id: studentId },
          data: { transportLineId: lineId, transportOrder: index + 1, updatedAt: now }
        });
      }

      return { status: 200 };
    });

    if (result.status === 404) {
      return errorResponse("لم يتم العثور على الخط.", 404);
    }

    if (result.status === 400) {
      return errorResponse("بعض الأطفال غير موجودين. حدّث الصفحة وحاول مجدداً.", 400);
    }

    return Response.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Transport line riders PUT error:", error);

    return errorResponse("حدث خطأ أثناء حفظ أطفال الخط.", 500);
  }
}
