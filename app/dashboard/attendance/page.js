
import { requirePageUser } from "../../../lib/auth";
import AppHeader from "../../../components/AppHeader";
import AttendanceBoard from "../../../components/AttendanceBoard";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const user = await requirePageUser(["ADMIN", "TEACHER"]);

  return (
    <>
      <AppHeader user={user} active="/dashboard/attendance" />
      <AttendanceBoard />
    </>
  );
}
