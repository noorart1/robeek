
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth";
import AppHeader from "../../../components/AppHeader";
import AttendanceBoard from "../../../components/AttendanceBoard";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    redirect("/login");
  }

  return (
    <>
      <AppHeader user={user} active="/dashboard/attendance" />
      <AttendanceBoard />
    </>
  );
}
