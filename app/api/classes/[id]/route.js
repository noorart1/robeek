
import prisma from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message, status, extra = {}) {
  return Response.json(
    { error: message, ...extra },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

// تعديل مرشدة الشعبة: PATCH { teacherName } (empty clears it).

export async function PATCH(request, { params }) {
  try {
    const user = await getCurrentUser();

    if (!user || user.role !== "ADMIN") {
      return errorResponse("ليس لديك صلاحية الوصول.", 401);
    }

    const { id } = await params;
    const classId = Number(id);

    if (!Number.isSafeInteger(classId) || classId <= 0) {
      return errorResponse("معرّف الشعبة غير صالح.", 400);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return errorResponse("البيانات المرسلة غير صالحة.", 400);
    }

    if (
      !body ||
      typeof body.teacherName !== "string" ||
      body.teacherName.length > 100
    ) {
      return errorResponse("اسم المرشدة غير صالح.", 400, { field: "teacherName" });
    }

    const result = await prisma.class.updateMany({
      where: { id: classId },
      data: { teacherName: body.teacherName.trim() || null }
    });

    if (result.count === 0) {
      return errorResponse("لم يتم العثور على الشعبة.", 404);
    }

    return Response.json(
      {
        class: await prisma.class.findUnique({
          where: { id: classId },
          select: { id: true, name: true, shift: true, teacherName: true }
        })
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Class PATCH error:", error);

    return errorResponse("حدث خطأ أثناء حفظ اسم المرشدة.", 500);
  }
}
