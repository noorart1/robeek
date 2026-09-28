
import prisma from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { errorResponse, readBody } from "../../../../lib/users";
import { checkStaff, formatStaff } from "../../../../lib/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function staffId(params) {
  const id = Number((await params).id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

//   PATCH { every field of the form }

export async function PATCH(request, { params }) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") return errorResponse("ليس لديك صلاحية الوصول.", 401);

    const id = await staffId(params);
    if (!id) return errorResponse("معرّف الموظف غير صالح.", 400);

    const body = await readBody(request);
    if (!body) return errorResponse("البيانات المرسلة غير صالحة.", 400);

    const checked = checkStaff(body);
    if (checked.error) return errorResponse(checked.error, 400, { field: checked.field });

    const staff = await prisma.staff.update({
      where: { id },
      data: { ...checked.data, updatedAt: new Date() }
    });

    return Response.json({ staff: formatStaff(staff) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error.code === "P2025") return errorResponse("الموظف غير موجود.", 404);
    console.error("Staff PATCH error:", error);
    return errorResponse("حدث خطأ أثناء حفظ الموظف.", 500);
  }
}

// Only for someone entered by mistake: once a salary is recorded, the
// person is kept and marked غير نشط instead.

export async function DELETE(request, { params }) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") return errorResponse("ليس لديك صلاحية الوصول.", 401);

    const id = await staffId(params);
    if (!id) return errorResponse("معرّف الموظف غير صالح.", 400);

    if (await prisma.salary.count({ where: { staffId: id } })) {
      return errorResponse("لهذا الموظف رواتب مسجلة؛ اجعله «غير نشط» بدلاً من الحذف.", 409);
    }

    await prisma.staff.delete({ where: { id } });

    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error.code === "P2025") return errorResponse("الموظف غير موجود.", 404);
    console.error("Staff DELETE error:", error);
    return errorResponse("حدث خطأ أثناء حذف الموظف.", 500);
  }
}
