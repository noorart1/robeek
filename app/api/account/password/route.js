
import bcrypt from "bcryptjs";
import prisma from "../../../../lib/prisma";
import { getCurrentUser, rotateSessions } from "../../../../lib/auth";
import {
  checkLoginLimit,
  getClientIp,
  getLoginKeys,
  recordFailedLogin,
  resetLoginLimit
} from "../../../../lib/login-limit";

export const runtime = "nodejs";

// Same minimum as scripts/create-admin.js.
const MIN_LENGTH = 12;

function errorResponse(message, status, extra = {}) {
  return Response.json(
    { error: message, ...extra },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

// تغيير كلمة المرور: POST { currentPassword, newPassword }.
// Wrong current passwords count against the same limit as logins, so this
// cannot be used to guess the password of a session left open.

export async function POST(request) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return errorResponse("ليس لديك صلاحية الوصول.", 401);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return errorResponse("البيانات المرسلة غير صالحة.", 400);
    }

    const { currentPassword, newPassword } = body || {};

    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string" ||
      currentPassword.length > 1024 ||
      newPassword.length > 1024
    ) {
      return errorResponse("البيانات المرسلة غير صالحة.", 400);
    }

    if (newPassword.length < MIN_LENGTH) {
      return errorResponse(
        `يجب أن تتكون كلمة المرور الجديدة من ${MIN_LENGTH} حرفاً على الأقل.`,
        400,
        { field: "newPassword" }
      );
    }

    if (newPassword === currentPassword) {
      return errorResponse(
        "كلمة المرور الجديدة مطابقة للحالية.",
        400,
        { field: "newPassword" }
      );
    }

    const keys = getLoginKeys(user.username, getClientIp(request));

    if (!(await checkLoginLimit(keys))) {
      return errorResponse(
        "تم تجاوز عدد المحاولات المسموح بها. يرجى المحاولة بعد ١٥ دقيقة.",
        429
      );
    }

    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      await recordFailedLogin(keys);

      return errorResponse(
        "كلمة المرور الحالية غير صحيحة.",
        400,
        { field: "currentPassword" }
      );
    }

    await resetLoginLimit(keys);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(newPassword, 12),
        updatedAt: new Date()
      }
    });

    const signedOut = await rotateSessions(user.id);

    return Response.json(
      { success: true, otherSessionsEnded: signedOut },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Password change error:", error);

    return errorResponse("حدث خطأ أثناء تغيير كلمة المرور.", 500);
  }
}
