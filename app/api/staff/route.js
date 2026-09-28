
import prisma from "../../../lib/prisma";
import { getCurrentUser } from "../../../lib/auth";
import { errorResponse, readBody } from "../../../lib/users";
import { checkStaff, formatStaff } from "../../../lib/staff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// الكادر: list (GET) and add (POST) staff. Admins only — it holds salaries.

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") return errorResponse("ليس لديك صلاحية الوصول.", 401);

    const staff = await prisma.staff.findMany({ orderBy: [{ isActive: "desc" }, { id: "asc" }] });

    return Response.json({ staff: staff.map(formatStaff) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Staff GET error:", error);
    return errorResponse("حدث خطأ أثناء تحميل الكادر.", 500);
  }
}

export async function POST(request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") return errorResponse("ليس لديك صلاحية الوصول.", 401);

    const body = await readBody(request);
    if (!body) return errorResponse("البيانات المرسلة غير صالحة.", 400);

    const checked = checkStaff(body);
    if (checked.error) return errorResponse(checked.error, 400, { field: checked.field });

    const staff = await prisma.staff.create({ data: { ...checked.data, updatedAt: new Date() } });

    return Response.json({ staff: formatStaff(staff) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Staff POST error:", error);
    return errorResponse("حدث خطأ أثناء حفظ الموظف.", 500);
  }
}
