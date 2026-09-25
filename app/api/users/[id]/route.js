
import bcrypt from "bcryptjs";
import prisma from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import {
  assignClasses,
  checkClassIds,
  checkFullName,
  checkPassword,
  checkRole,
  errorResponse,
  loadUser,
  otherActiveAdmins,
  readBody
} from "../../../../lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// تعديل مستخدم:
//   PATCH { fullName?, role?, isActive?, classIds?, password? }
// `password` is an admin reset; deactivating or resetting signs the user
// out everywhere. Guards keep the school from locking itself out: no
// self-deactivation or self-demotion, and never zero active admins.

export async function PATCH(request, { params }) {
  try {
    const admin = await getCurrentUser();

    if (!admin || admin.role !== "ADMIN") {
      return errorResponse("ليس لديك صلاحية الوصول.", 401);
    }

    const { id } = await params;
    const userId = Number(id);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return errorResponse("معرّف المستخدم غير صالح.", 400);
    }

    const body = await readBody(request);

    if (!body) {
      return errorResponse("البيانات المرسلة غير صالحة.", 400);
    }

    const self = userId === admin.id;
    const data = {};

    if ("fullName" in body) {
      const check = checkFullName(body.fullName);
      if (check.error) return errorResponse(check.error, 400, { field: check.field });
      data.fullName = check.value;
    }

    if ("role" in body) {
      const check = checkRole(body.role);
      if (check.error) return errorResponse(check.error, 400, { field: check.field });
      if (self && check.value !== admin.role) {
        return errorResponse("لا يمكنك تغيير صلاحيتك بنفسك.", 400, { field: "role" });
      }
      data.role = check.value;
    }

    if ("isActive" in body) {
      if (typeof body.isActive !== "boolean") {
        return errorResponse("البيانات المرسلة غير صالحة.", 400);
      }
      if (self && !body.isActive) {
        return errorResponse("لا يمكنك إيقاف حسابك بنفسك.", 400, { field: "isActive" });
      }
      data.isActive = body.isActive;
    }

    if ("password" in body) {
      if (self) {
        return errorResponse(
          "لتغيير كلمة مرورك استخدم صفحة «حسابي».",
          400,
          { field: "password" }
        );
      }
      const check = checkPassword(body.password);
      if (check.error) return errorResponse(check.error, 400, { field: check.field });
      data.passwordHash = await bcrypt.hash(check.value, 12);
    }

    const classCheck = checkClassIds(body.classIds);
    if (classCheck.error) {
      return errorResponse(classCheck.error, 400, { field: classCheck.field });
    }

    const result = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId } });

      if (!target) return { error: "NOT_FOUND" };

      const role = data.role ?? target.role;
      const active = data.isActive ?? target.isActive;

      // Would this leave the school without an active admin?
      if (
        target.role === "ADMIN" &&
        target.isActive &&
        (role !== "ADMIN" || !active) &&
        (await otherActiveAdmins(tx, userId)) === 0
      ) {
        return { error: "LAST_ADMIN" };
      }

      await tx.user.update({
        where: { id: userId },
        data: { ...data, updatedAt: new Date() }
      });

      const fullName = data.fullName ?? target.fullName;

      // Sections belong to teachers only; an admin keeps none.
      if (role !== "TEACHER") {
        await assignClasses(tx, userId, fullName, []);
      } else if (classCheck.value !== undefined) {
        await assignClasses(tx, userId, fullName, classCheck.value);
      } else if (data.fullName) {
        // Renamed: the sections show the new name.
        await tx.class.updateMany({
          where: { teacherUserId: userId },
          data: { teacherName: fullName }
        });
      }

      // A reset password or a stopped account must stop working now.
      if (data.passwordHash || data.isActive === false) {
        await tx.session.deleteMany({ where: { userId } });
      }

      return { ok: true };
    });

    if (result.error === "NOT_FOUND") {
      return errorResponse("لم يتم العثور على المستخدم.", 404);
    }

    if (result.error === "LAST_ADMIN") {
      return errorResponse(
        "يجب أن يبقى مدير نشط واحد على الأقل.",
        400,
        { field: "isActive" }
      );
    }

    return Response.json(
      { user: await loadUser(userId) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error.code === "NO_CLASS") {
      return errorResponse("إحدى الشعب المحددة غير موجودة.", 400, { field: "classIds" });
    }

    console.error("User PATCH error:", error);

    return errorResponse("حدث خطأ أثناء حفظ المستخدم.", 500);
  }
}
