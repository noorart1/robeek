
import prisma from "../../../lib/prisma";
import { getCurrentUser } from "../../../lib/auth";
import { activeAcademicYear } from "../../../lib/student-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Choices for the section and transport-line pickers.

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user || (user.role !== "ADMIN" && user.role !== "TEACHER")) {
      return Response.json(
        { error: "ليس لديك صلاحية الوصول." },
        { status: 401 }
      );
    }

    const year = await activeAcademicYear();
    const teacher = user.role === "TEACHER";

    const [classes, lines] = await Promise.all([
      prisma.class.findMany({
        where: {
          ...(year ? { academicYearId: year.id } : {}),
          // A teacher only sees the sections assigned to her.
          ...(teacher ? { teacherUserId: user.id } : {})
        },
        select: { id: true, name: true, shift: true, teacherName: true, teacherUserId: true },
        orderBy: [{ shift: "desc" }, { name: "asc" }]
      }),
      teacher ? [] : prisma.transportLine.findMany({
        select: { id: true, name: true, driverPhone: true, shift: true },
        orderBy: { id: "asc" }
      })
    ]);

    return Response.json(
      { academicYear: year?.name ?? null, classes, lines },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Options GET error:", error);

    return Response.json(
      { error: "تعذر تحميل القوائم." },
      { status: 500 }
    );
  }
}
