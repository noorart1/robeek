
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../../lib/auth";
import AppHeader from "../../../components/AppHeader";
import StudentsTable from "../../../components/StudentsTable";

export const dynamic = "force-dynamic";

// ?class=<id> and ?review=1 preset the table's filters (links from the
// dashboard).
export default async function StudentsPage({ searchParams }) {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    redirect("/login");
  }

  const params = await searchParams;

  return (
    <>
      <AppHeader user={user} active="/dashboard/students" />
      <StudentsTable
        initialClassId={typeof params.class === "string" ? params.class : ""}
        initialReview={params.review === "1"}
      />
    </>
  );
}
