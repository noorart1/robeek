
import { requirePageUser } from "../../../lib/auth";
import AppHeader from "../../../components/AppHeader";
import PasswordForm from "../../../components/PasswordForm";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requirePageUser(["ADMIN", "TEACHER"]);

  return (
    <>
      <AppHeader user={user} active="/dashboard/account" />

      <main style={{ maxWidth: "700px", margin: "24px auto", padding: "0 20px" }}>
        <h1 style={{ color: "#1e40af", marginBottom: "4px" }}>حسابي</h1>
        <p style={{ color: "#64748b", marginTop: 0 }}>
          {user.fullName} — اسم المستخدم: <span dir="ltr">{user.username}</span>
        </p>

        <section style={{ padding: "20px", backgroundColor: "#ffffff", borderRadius: "12px" }}>
          <h2 style={{ marginTop: 0, fontSize: "18px", color: "#1e40af" }}>تغيير كلمة المرور</h2>
          <PasswordForm />
        </section>
      </main>
    </>
  );
}
