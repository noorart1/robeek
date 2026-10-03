import { requirePageUser } from "../../../lib/auth";
import AppHeader from "../../../components/AppHeader";
import CarryOver from "../../../components/CarryOver";

export const dynamic = "force-dynamic";

// نقل من السنة السابقة: linked from the dashboard of the active year.
export default async function CarryOverPage() {
  const user = await requirePageUser(["ADMIN"]);

  return (
    <>
      <AppHeader user={user} active="/dashboard" />
      <main style={{ maxWidth: "1100px", margin: "24px auto", padding: "0 20px" }}>
        <h1 style={{ color: "#1e40af", marginBottom: "8px" }}>نقل من السنة السابقة</h1>
        <CarryOver />
      </main>
    </>
  );
}
