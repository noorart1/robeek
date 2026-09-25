
import { requirePageUser } from "../../../lib/auth";
import AppHeader from "../../../components/AppHeader";
import UsersManager from "../../../components/UsersManager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await requirePageUser(["ADMIN"]);

  return (
    <>
      <AppHeader user={user} active="/dashboard/users" />
      <UsersManager />
    </>
  );
}
