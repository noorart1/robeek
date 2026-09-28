import Link from "next/link";
import { requirePageUser } from "../../../lib/auth";
import AppHeader from "../../../components/AppHeader";
import StaffManager from "../../../components/StaffManager";

export const dynamic = "force-dynamic";

// الكادر. Admins only: it holds salaries. Monthly pay is recorded under
// المالية → الرواتب.
export default async function StaffPage() {
  const user = await requirePageUser(["ADMIN"]);

  return (
    <>
      <AppHeader user={user} active="/dashboard/staff" />

      <main style={{ maxWidth: "1200px", margin: "24px auto", padding: "0 20px" }}>
        <h1 style={{ color: "#1e40af", marginBottom: "4px" }}>الكادر</h1>
        <p style={{ color: "#64748b", marginTop: 0 }}>
          تسجيل الرواتب الشهرية من <Link href="/dashboard/finance?tab=salaries">المالية ← الرواتب</Link>.
        </p>

        <StaffManager />
      </main>
    </>
  );
}
