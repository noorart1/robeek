
import { redirect } from "next/navigation";
import prisma from "../../../lib/prisma";
import { getCurrentUser } from "../../../lib/auth";
import { classLabel, fullName } from "../../../lib/labels";
import AppHeader from "../../../components/AppHeader";
import { AddLine, LineHeader } from "../../../components/LineEditor";

export const dynamic = "force-dynamic";

const cell = {
  padding: "8px 10px",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "right",
  whiteSpace: "nowrap"
};

function phoneOf(student, relation) {
  return student.StudentParent.find((link) => link.relation === relation)?.Parent.phone || "";
}

export default async function LinesPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    redirect("/login");
  }

  const lines = await prisma.transportLine.findMany({
    orderBy: { id: "asc" },
    select: {
      id: true,
      name: true,
      driverPhone: true,
      shift: true,
      Student: {
        orderBy: [{ transportOrder: "asc" }, { id: "asc" }],
        select: {
          id: true,
          firstName: true,
          fatherName: true,
          grandfatherName: true,
          lastName: true,
          address: true,
          status: true,
          StudentParent: {
            select: { relation: true, Parent: { select: { phone: true } } }
          },
          Enrollment: {
            orderBy: { id: "desc" },
            take: 1,
            select: { Class: { select: { name: true, shift: true } } }
          }
        }
      }
    }
  });

  const riders = lines.reduce((sum, line) => sum + line.Student.length, 0);

  return (
    <>
      <AppHeader user={user} active="/dashboard/lines" />

      <main style={{ maxWidth: "1100px", margin: "24px auto", padding: "0 20px" }}>
        <h1 style={{ color: "#1e40af", marginBottom: "4px" }}>خطوط النقل</h1>
        <p style={{ color: "#64748b", marginTop: 0 }}>
          {lines.length} خطوط — {riders} طفلاً مشتركاً. لتغيير خط الطفل افتح بياناته من صفحة الأطفال.
        </p>

        <div style={{ marginBottom: "16px" }}>
          <AddLine />
        </div>

        {lines.length === 0 && (
          <p style={{ color: "#64748b" }}>لا توجد خطوط نقل بعد.</p>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(480px, 100%), 1fr))",
            gap: "16px"
          }}
        >
          {lines.map((line) => (
            <section
              key={line.id}
              style={{ backgroundColor: "#ffffff", borderRadius: "12px", overflowX: "auto" }}
            >
              <LineHeader
                line={{
                  id: line.id,
                  name: line.name,
                  driverPhone: line.driverPhone,
                  shift: line.shift
                }}
                riders={line.Student.length}
              />

              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                <thead>
                  <tr style={{ color: "#64748b" }}>
                    {["ت", "الاسم", "الشعبة", "السكن", "رقم الأب", "رقم الأم"].map((h) => (
                      <th key={h} style={{ ...cell, fontWeight: "normal" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {line.Student.map((student, index) => (
                    <tr key={student.id} style={{ opacity: student.status === "ACTIVE" ? 1 : 0.5 }}>
                      <td style={cell}>{index + 1}</td>
                      <td style={{ ...cell, fontWeight: 600 }}>{fullName(student)}</td>
                      <td style={cell}>{classLabel(student.Enrollment[0]?.Class)}</td>
                      <td style={cell}>{student.address || ""}</td>
                      <td style={cell} dir="ltr">{phoneOf(student, "FATHER")}</td>
                      <td style={cell} dir="ltr">{phoneOf(student, "MOTHER")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
