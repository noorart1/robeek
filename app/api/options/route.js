
import prisma from "../../../lib/prisma";
import { getCurrentUser } from "../../../lib/auth";
import { activeAcademicYear } from "../../../lib/student-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Choices for the section and transport-line pickers: the school year's
// sections, and those of the active summer course (summerClasses).

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user || (user.role !== "ADMIN" && user.role !== "TEACHER")) {
      return Response.json(
        { error: "ليس لديك صلاحية الوصول." },
        { status: 401 }
      );
    }

    const [year, summer] = await Promise.all([activeAcademicYear(), activeAcademicYear(prisma, "SUMMER")]);
    const teacher = user.role === "TEACHER";

    const sections = (academicYearId) =>
      prisma.class.findMany({
        where: {
          academicYearId,
          // A teacher only sees the sections assigned to her.
          ...(teacher ? { teacherUserId: user.id } : {})
        },
        select: { id: true, name: true, shift: true, teacherName: true, teacherUserId: true },
        orderBy: [{ shift: "desc" }, { name: "asc" }]
      });

    const [classes, summerClasses, lines] = await Promise.all([
      // No active year (a fresh database): every section, as before.
      sections(year?.id),
      summer ? sections(summer.id) : [],
      teacher ? [] : prisma.transportLine.findMany({
        select: { id: true, name: true, driverPhone: true, shift: true },
        orderBy: { id: "asc" }
      })
    ]);

    return Response.json(
      { academicYear: year?.name ?? null, classes, summerYear: summer?.name ?? null, summerClasses, lines },
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
