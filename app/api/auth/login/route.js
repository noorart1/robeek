
import prisma from "../../../../lib/prisma";
import { createSession } from "../../../../lib/auth";

import {
  getLoginKey,
  checkLoginLimit,
  recordFailedLogin,
  resetLoginLimit
} from "../../../../lib/login-limit";

import bcrypt from "bcryptjs";

export const runtime = "nodejs";

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
        { error: "اطلاعات ورود نامعتبر است." },
        { status: 400 }
      );
    }

    const loginKey = getLoginKey(username);

    const allowed = await checkLoginLimit(loginKey);

    if (!allowed) {
      return Response.json(
        {
          error:
            "تعداد تلاش‌های ورود بیش از حد مجاز است. لطفاً ۱۵ دقیقه بعد تلاش کنید."
        },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { username }
    });

    const validPassword = user
      ? await bcrypt.compare(
          password,
          user.passwordHash
        )
      : false;

    if (
      !user ||
      !user.isActive ||
      user.role !== "ADMIN" ||
      !validPassword
    ) {
      await recordFailedLogin(loginKey);

      return Response.json(
        {
          error:
            "نام کاربری یا رمز عبور نادرست است."
        },
        { status: 401 }
      );
    }

    await resetLoginLimit(loginKey);

    await createSession(user.id);

    return Response.json({
      success: true
    });
  } catch (error) {
    console.error("Login error:", error);

    return Response.json(
      { error: "خطا در ورود به سامانه." },
      { status: 500 }
    );
  }
}