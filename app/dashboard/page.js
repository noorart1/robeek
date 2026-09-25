
import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "../../lib/prisma";
import { getCurrentUser } from "../../lib/auth";
import AppHeader from "../../components/AppHeader";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    redirect("/login");
  }

  const [totalStudents, activeStudents, totalParents] =
    await Promise.all([
      prisma.student.count(),
      prisma.student.count({ where: { status: "ACTIVE" } }),
      prisma.parent.count()
    ]);

  const stats = [
    ["عدد الأطفال", totalStudents],
    ["الأطفال النشطون", activeStudents],
    ["أولياء الأمور", totalParents]
  ];

  return (
    <>
      <AppHeader user={user} active="/dashboard" />

      <main
        style={{
          maxWidth: "1100px",
          margin: "30px auto",
          padding: "0 20px"
        }}
      >
        <h1 style={{ color: "#1e40af" }}>
          مرحباً، {user.fullName}
        </h1>

        <section
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "16px"
          }}
        >
          {stats.map(([label, value]) => (
            <div
              key={label}
              style={{
                padding: "20px",
                backgroundColor: "#ffffff",
                borderRadius: "12px"
              }}
            >
              <div style={{ color: "#64748b" }}>{label}</div>
              <div
                style={{
                  fontSize: "32px",
                  fontWeight: "bold",
                  color: "#1e293b"
                }}
              >
                {value.toLocaleString("ar-IQ")}
              </div>
            </div>
          ))}
        </section>

        <Link
          href="/dashboard/students"
          style={{
            display: "inline-block",
            marginTop: "24px",
            padding: "14px 28px",
            backgroundColor: "#2563eb",
            color: "#ffffff",
            borderRadius: "8px",
            textDecoration: "none"
          }}
        >
          إدارة بيانات الأطفال ←
        </Link>
      </main>
    </>
  );
}
