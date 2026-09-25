
import { deleteSession } from "../../../../lib/auth";

export async function POST() {
  try {
    await deleteSession();

    return Response.json({
      success: true,
      message: "تم تسجيل الخروج بنجاح."
    });
  } catch (error) {
    console.error("Logout error:", error);

    return Response.json(
      { error: "حدث خطأ أثناء تسجيل الخروج." },
      { status: 500 }
    );
  }
}
