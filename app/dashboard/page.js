
import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "../../lib/prisma";
import { getCurrentUser } from "../../lib/auth";
import { SHIFTS } from "../../lib/labels";
import { activeAcademicYear } from "../../lib/student-data";
import AppHeader from "../../components/AppHeader";

export const dynamic = "force-dynamic";

const card = {
  padding: "18px 20px",
  backgroundColor: "#ffffff",
  borderRadius: "12px"
};

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    redirect("/login");
  }

  const year = await activeAcademicYear();

  const [classes, activeStudents, needsReview, totalParents] =
    await Promise.all([
      prisma.class.findMany({
        where: year ? { academicYearId: year.id } : undefined,
        select: {
          id: true,
          name: true,
          shift: true,
          teacherName: true,
          _count: {
            select: {
              Enrollment: { where: { Student: { status: "ACTIVE" } } }
            }
          }
        },
        orderBy: { name: "asc" }
      }),
      prisma.student.count({ where: { status: "ACTIVE" } }),
      prisma.student.count({ where: { reviewNote: { not: null } } }),
      prisma.parent.count()
    ]);

  const stats = [
    ["الأطفال النشطون", activeStudents],
    ["أولياء الأمور", totalParents],
    ["بحاجة إلى مراجعة", needsReview, "/dashboard/students?review=1"]
  ];

  return (
    <>
      <AppHeader user={user} active="/dashboard" />

      <main
        style={{
          maxWidth: "1100px",
          margin: "24px auto",
          padding: "0 20px"
        }}
      >
        <h1 style={{ color: "#1e40af", marginBottom: "4px" }}>
          مرحباً، {user.fullName}
        </h1>
        {year && (
          <p style={{ color: "#64748b", marginTop: 0 }}>
            السنة الدراسية {year.name}
          </p>
        )}

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "14px"
          }}
        >
          {stats.map(([label, value, href]) => {
            const body = (
              <>
                <div style={{ color: "#64748b" }}>{label}</div>
                <div style={{ fontSize: "30px", fontWeight: "bold", color: href && value ? "#b45309" : "#1e293b" }}>
                  {value}
                </div>
              </>
            );

            return href && value ? (
              <Link key={label} href={href} style={{ ...card, textDecoration: "none" }}>
                {body}
              </Link>
            ) : (
              <div key={label} style={card}>{body}</div>
            );
          })}
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "14px",
            marginTop: "18px"
          }}
        >
          {Object.entries(SHIFTS).map(([shift, label]) => {
            const rows = classes.filter((cls) => cls.shift === shift);
            const total = rows.reduce((sum, cls) => sum + cls._count.Enrollment, 0);

            return (
              <div key={shift} style={card}>
                <h2 style={{ margin: "0 0 10px", fontSize: "18px", color: "#1e40af" }}>
                  الفترة {label === "صباحي" ? "الصباحية" : "المسائية"}
                </h2>

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {rows.map((cls) => (
                      <tr key={cls.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "7px 0" }}>
                          <Link
                            href={`/dashboard/students?class=${cls.id}`}
                            style={{ color: "#1e293b", textDecoration: "none" }}
                          >
                            الشعبة {cls.name}
                          </Link>
                        </td>
                        <td style={{ color: "#64748b" }}>{cls.teacherName || ""}</td>
                        <td style={{ textAlign: "left", fontWeight: "bold" }}>
                          {cls._count.Enrollment}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ padding: "8px 0", fontWeight: "bold" }}>المجموع</td>
                      <td />
                      <td style={{ textAlign: "left", fontWeight: "bold", color: "#1e40af" }}>
                        {total}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })}
        </section>
      </main>
    </>
  );
}
