
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth";
import LogoutButton from "../../components/LogoutButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    redirect("/login");
  }

  return (
    <main
      style={{
        maxWidth: "1100px",
        margin: "40px auto",
        padding: "30px"
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "20px",
          flexWrap: "wrap",
          backgroundColor: "#ffffff",
          padding: "24px",
          borderRadius: "12px"
        }}
      >
        <div>
          <h1>سامانه مدیریت مدرسه</h1>

          <p>
            خوش آمدید، {user.fullName}
          </p>

          <p style={{ color: "#64748b" }}>
            سطح دسترسی: مدیر مدرسه
          </p>
        </div>

        <LogoutButton />
      </header>

      <section
        style={{
          marginTop: "30px",
          padding: "30px",
          backgroundColor: "#ffffff",
          borderRadius: "12px"
        }}
      >
        <h2>پنل مدیریت</h2>

        <p>
          به سامانه مدیریت مدرسه خوش آمدید.
        </p>

        <p>
          بخش مدیریت دانش‌آموزان به‌زودی
          در این قسمت فعال خواهد شد.
        </p>
      </section>
    </main>
  );
}