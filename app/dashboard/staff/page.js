import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePageUser } from "../../../lib/auth";
import { canFinance } from "../../../lib/finance-access";
import AppHeader from "../../../components/AppHeader";
import StaffManager from "../../../components/StaffManager";

export const dynamic = "force-dynamic";

// الكادر. It holds salaries: admins, and a معاون given رواتب الموظفين
// (read only without WRITE). Monthly pay is recorded under المالية → الرواتب.
export default async function StaffPage() {
  const user = await requirePageUser(["ADMIN", "DEPUTY"]);
  if (!canFinance(user, "salaries")) redirect("/dashboard");

  return (
    <>
      <AppHeader user={user} active="/dashboard/staff" />

      <main style={{ maxWidth: "1200px", margin: "24px auto", padding: "0 20px" }}>
        <h1 style={{ color: "#1e40af", marginBottom: "4px" }}>الكادر</h1>
        <p style={{ color: "#64748b", marginTop: 0 }}>
          تسجيل الرواتب الشهرية من <Link href="/dashboard/finance?tab=salaries">المالية ← رواتب الموظفين</Link>.
        </p>

        <StaffManager readOnly={!canFinance(user, "salaries", true)} />
      </main>
    </>
  );
}
