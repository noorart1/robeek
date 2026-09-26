import { requirePageUser } from "../../../lib/auth";
import AppHeader from "../../../components/AppHeader";
import BackupsManager from "../../../components/BackupsManager";

export const dynamic = "force-dynamic";

export default async function BackupsPage() {
  const user = await requirePageUser(["ADMIN"]);

  return (
    <>
      <AppHeader user={user} active="/dashboard/backups" />
      <BackupsManager />
    </>
  );
}
