
import prisma from "../../../../lib/prisma";
import { requireOffice } from "../../../../lib/auth";
import { checkStaffId, setClassTeacher } from "../../../../lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(message, status, extra = {}) {
  return Response.json(
    { error: message, ...extra },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

// تعديل مرشدة الشعبة: PATCH { staffId } — chosen from الكادر, null for
// none (lib/users.js setClassTeacher).

export async function PATCH(request, { params }) {
  try {
    const { user, response } = await requireOffice();
    if (response) return response;

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

    const staff = await checkStaffId(prisma, body?.staffId ?? null);

    if (staff.error) {
      return errorResponse(staff.error, 400, { field: staff.field });
    }

    return Response.json(
      { class: await setClassTeacher(prisma, classId, staff.value) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error.code === "P2025") {
      return errorResponse("لم يتم العثور على الشعبة.", 404);
    }

    console.error("Class PATCH error:", error);

    return errorResponse("حدث خطأ أثناء حفظ اسم المرشدة.", 500);
  }
}
