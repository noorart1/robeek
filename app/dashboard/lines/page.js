
import prisma from "../../../lib/prisma";
import { requirePageUser } from "../../../lib/auth";
import { classLabel, fullName } from "../../../lib/labels";
import AppHeader from "../../../components/AppHeader";
import LinesBoard from "../../../components/LinesBoard";
import { yearView } from "../../../lib/year-view";

export const dynamic = "force-dynamic";

// The section shown is the chosen year's (an earlier one's: from then).
const studentSelectFor = (yearId) => ({
  id: true,
  firstName: true,
  fatherName: true,
  grandfatherName: true,
  lastName: true,
  Enrollment: {
    ...(yearId && { where: { academicYearId: yearId } }),
    orderBy: { id: "desc" },
    take: 1,
    select: { Class: { select: { name: true, shift: true } } }
  }
});

function phoneOf(student, relation) {
  return student.StudentParent.find((link) => link.relation === relation)?.Parent.phone || "";
}

export default async function LinesPage() {
  const user = await requirePageUser(["ADMIN"]);

  // The year chosen in the header. A child's line is not kept per year:
  // an earlier year shows its children on the line they are on now.
  const { year, isActive } = await yearView();
  const inYear = { Enrollment: { some: { academicYearId: year?.id ?? -1 } } };
  const studentSelect = studentSelectFor(isActive ? null : year?.id);

  const [lines, students] = await Promise.all([
    prisma.transportLine.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        driverPhone: true,
        shift: true,
        isActive: true,
        Student: {
          orderBy: [{ transportOrder: "asc" }, { id: "asc" }],
          ...(!isActive && { where: inYear }),
          select: {
            ...studentSelect,
            address: true,
            status: true,
            StudentParent: {
              select: { relation: true, Parent: { select: { phone: true } } }
            }
          }
        }
      }
    }),
    // Candidates for "add a child to this line".
    prisma.student.findMany({
      where: isActive ? { status: "ACTIVE" } : inYear,
      orderBy: { firstName: "asc" },
      select: { ...studentSelect, transportLineId: true }
    })
  ]);

  return (
    <>
      <AppHeader user={user} active="/dashboard/lines" />

      <main style={{ maxWidth: "1200px", margin: "24px auto", padding: "0 20px" }}>
        <h1 style={{ color: "#1e40af", marginBottom: "4px" }}>خطوط النقل</h1>

        <LinesBoard
          pastYear={!isActive}
          lines={(isActive ? lines : lines.filter((line) => line.Student.length > 0)).map((line) => ({
            id: line.id,
            name: line.name,
            driverPhone: line.driverPhone,
            shift: line.shift,
            isActive: line.isActive,
            // An active line lists this year's children; an inactive one,
            // everyone who rode it (history). An earlier year: its children.
            riders: line.Student.filter((student) => !isActive || !line.isActive || student.status === "ACTIVE").map((student) => ({
              id: student.id,
              name: fullName(student),
              classLabel: classLabel(student.Enrollment[0]?.Class),
              address: student.address || "",
              active: student.status === "ACTIVE",
              fatherPhone: phoneOf(student, "FATHER"),
              motherPhone: phoneOf(student, "MOTHER")
            }))
          }))}
          students={students.map((student) => ({
            id: student.id,
            name: fullName(student),
            classLabel: classLabel(student.Enrollment[0]?.Class),
            lineId: student.transportLineId
          }))}
        />
      </main>
    </>
  );
}
