
import prisma from "../../../../lib/prisma";
import { createSession } from "../../../../lib/auth";

import {
  getClientIp,
  getLoginKeys,
  checkLoginLimit,
  recordFailedLogin,
  resetLoginLimit
} from "../../../../lib/login-limit";

import bcrypt from "bcryptjs";

export const runtime = "nodejs";

// Compared against when the username does not exist, so that response
// time does not reveal which usernames are real.
const DUMMY_HASH = bcrypt.hashSync("dummy-password", 12);

export async function POST(request) {
  try {
    const body = await request.json();

    const username = body.username;
    const password = body.password;

    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      username.length > 100 ||
      password.length > 1024
    ) {
      return Response.json(
        { error: "بيانات الدخول غير صالحة." },
        { status: 400 }
      );
    }

    const loginKeys = getLoginKeys(
      username,
      getClientIp(request)
    );

    const allowed = await checkLoginLimit(loginKeys);

    if (!allowed) {
      return Response.json(
        {
          error:
            "تم تجاوز عدد محاولات الدخول المسموح بها. يرجى المحاولة بعد ١٥ دقيقة."
        },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { username }
    });

    const validPassword = await bcrypt.compare(
      password,
      user ? user.passwordHash : DUMMY_HASH
    );

    if (
      !user ||
      !user.isActive ||
      user.role !== "ADMIN" ||
      !validPassword
    ) {
      await recordFailedLogin(loginKeys);

      return Response.json(
        {
          error:
            "اسم المستخدم أو كلمة المرور غير صحيحة."
        },
        { status: 401 }
      );
    }

    await resetLoginLimit(loginKeys);

    await createSession(user.id);

    return Response.json({
      success: true
    });
  } catch (error) {
    console.error("Login error:", error);

    return Response.json(
      { error: "حدث خطأ أثناء تسجيل الدخول." },
      { status: 500 }
    );
  }
}
