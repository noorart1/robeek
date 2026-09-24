
import { deleteSession } from "../../../../lib/auth";

export async function POST() {
  try {
    await deleteSession();

    return Response.json({
      success: true,
      message: "خروج با موفقیت انجام شد."
    });
  } catch (error) {
    console.error("Logout error:", error);

    return Response.json(
      { error: "خطا در خروج از سامانه." },
      { status: 500 }
    );
  }
}