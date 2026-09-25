
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth";
import AppHeader from "../../../components/AppHeader";
import StudentsTable from "../../../components/StudentsTable";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    redirect("/login");
  }

  return (
    <>
      <AppHeader user={user} active="/dashboard/students" />
      <StudentsTable />
    </>
  );
}
