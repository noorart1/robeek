
import bcrypt from "bcryptjs";
import prisma from "../../../lib/prisma";
import { requireAdmin } from "../../../lib/auth";
import {
  assignClasses,
  checkClassIds,
  checkFullName,
  checkPassword,
  checkRole,
  checkStaffId,
  checkUsername,
  errorResponse,
  formatUser,
  loadUser,
  readBody,
  userSelect
} from "../../../lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// المستخدمون: list (GET) and create (POST) accounts. Admins only.

export async function GET() {
  try {
    const { user, response } = await requireAdmin();
    if (response) return response;

    const users = await prisma.user.findMany({
      select: userSelect,
      orderBy: [{ role: "asc" }, { fullName: "asc" }]
    });

    return Response.json(
      { users: users.map(formatUser), currentUserId: user.id },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Users GET error:", error);

    return errorResponse("حدث خطأ أثناء تحميل المستخدمين.", 500);
  }
}

//   POST { username, fullName, password, role: ADMIN|TEACHER, classIds?, staffId? }
// With staffId the account belongs to that person in الكادر and takes
// her name from there.

export async function POST(request) {
  try {
    const { user, response } = await requireAdmin();
    if (response) return response;

    const body = await readBody(request);

    if (!body) {
      return errorResponse("البيانات المرسلة غير صالحة.", 400);
    }

    const checks = [
      checkUsername(body.username),
      checkFullName(body.fullName),
      checkPassword(body.password),
      checkRole(body.role),
      checkClassIds(body.classIds ?? [])
    ];

    const failed = checks.find((check) => check.error);

    if (failed) {
      return errorResponse(failed.error, 400, { field: failed.field });
    }

    const staff = await checkStaffId(prisma, body.staffId);
    if (staff.error) return errorResponse(staff.error, 400, { field: staff.field });

    const [username, typedName, password, role, classIds] = checks.map((c) => c.value);
    const fullName = staff.staff?.name ?? typedName;
    const staffId = staff.value ?? null;
    const passwordHash = await bcrypt.hash(password, 12);

    const id = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username,
          fullName,
          passwordHash,
          role,
          staffId,
          isActive: true,
          updatedAt: new Date()
        },
        select: { id: true }
      });

      if (role === "TEACHER") {
        await assignClasses(tx, created.id, fullName, classIds, staffId);
      }

      return created.id;
    });

    return Response.json(
      { user: await loadUser(id) },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error.code === "P2002" && String(error.meta?.target).includes("staffId")) {
      return errorResponse("هذا الموظف مرتبط بحساب آخر.", 409, { field: "staffId" });
    }

    if (error.code === "P2002") {
      return errorResponse("اسم المستخدم مستخدم مسبقاً.", 409, { field: "username" });
    }

    if (error.code === "NO_CLASS") {
      return errorResponse("إحدى الشعب المحددة غير موجودة.", 400, { field: "classIds" });
    }

    console.error("Users POST error:", error);

    return errorResponse("حدث خطأ أثناء إنشاء المستخدم.", 500);
  }
}
