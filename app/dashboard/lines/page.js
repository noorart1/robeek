
import prisma from "../../../lib/prisma";
import { requirePageUser } from "../../../lib/auth";
import { classLabel, fullName } from "../../../lib/labels";
import AppHeader from "../../../components/AppHeader";
import LinesBoard from "../../../components/LinesBoard";

export const dynamic = "force-dynamic";

const studentSelect = {
  id: true,
  firstName: true,
  fatherName: true,
  grandfatherName: true,
  lastName: true,
  Enrollment: {
    orderBy: { id: "desc" },
    take: 1,
    select: { Class: { select: { name: true, shift: true } } }
  }
};

function phoneOf(student, relation) {
  return student.StudentParent.find((link) => link.relation === relation)?.Parent.phone || "";
}

export default async function LinesPage() {
  const user = await requirePageUser(["ADMIN"]);

  const [lines, students] = await Promise.all([
    prisma.transportLine.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        name: true,
        driverPhone: true,
        shift: true,
        Student: {
          orderBy: [{ transportOrder: "asc" }, { id: "asc" }],
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
      where: { status: "ACTIVE" },
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
          lines={lines.map((line) => ({
            id: line.id,
            name: line.name,
            driverPhone: line.driverPhone,
            shift: line.shift,
            riders: line.Student.map((student) => ({
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
