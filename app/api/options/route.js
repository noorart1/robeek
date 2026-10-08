
import prisma from "../../../lib/prisma";
import { getCurrentUser } from "../../../lib/auth";
import { activeAcademicYear } from "../../../lib/student-data";
import { yearView } from "../../../lib/year-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Choices for the section and transport-line pickers: the school year's
// sections, and those of its summer course (summerClasses, for registering
// a child in it): the year chosen in the header (lib/year-view.js), or a
// summer course on its own. A teacher has no picker: her sections of the
// active year and of the active summer course, all in classes.

export async function GET() {
  try {
    const user = await getCurrentUser();

    if (!user || !["ADMIN", "DEPUTY", "TEACHER"].includes(user.role)) {
      return Response.json(
        { error: "ليس لديك صلاحية الوصول." },
        { status: 401 }
      );
    }

    const teacher = user.role === "TEACHER";
    const { year, summer, isActive } = teacher
      ? { year: await activeAcademicYear(), summer: await activeAcademicYear(prisma, "SUMMER"), isActive: true }
      : await yearView();

    const sections = (academicYearId) =>
      prisma.class.findMany({
        where: {
          academicYearId,
          // A teacher only sees the sections assigned to her.
          ...(teacher ? { teacherUserId: user.id } : {})
        },
        select: { id: true, name: true, shift: true, teacherName: true, teacherUserId: true, staffId: true },
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

    if (teacher) {
      classes.push(...summerClasses.map((c) => ({ ...c, name: `${c.name} (الصيفية)` })));
      summerClasses.length = 0;
    }

    return Response.json(
      {
        academicYear: year?.name ?? null, isActiveYear: isActive, classes,
        summerYear: summer?.name ?? null, summerYearId: summer?.id ?? null, summerClasses, lines
      },
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
