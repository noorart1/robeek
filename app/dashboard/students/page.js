import { redirect } from "next/navigation";
import { requirePageUser } from "../../../lib/auth";
import { yearView } from "../../../lib/year-view";
import AppHeader from "../../../components/AppHeader";
import StudentsTable from "../../../components/StudentsTable";

export const dynamic = "force-dynamic";

// ?class=<id> and ?review=1 preset the table's filters (links from the
// dashboard). The year is the header's; ?term=summer chooses the school
// year's summer course there (/dashboard/year), shown on its own.
export default async function StudentsPage({ searchParams }) {
  const user = await requirePageUser(["ADMIN", "DEPUTY"]);

  const params = await searchParams;
  const classId = typeof params.class === "string" ? params.class : "";

  if (params.term === "summer") {
    const { summer } = await yearView();
    const to = `/dashboard/students${classId ? `?class=${encodeURIComponent(classId)}` : ""}`;
    redirect(summer ? `/dashboard/year?${new URLSearchParams({ id: summer.id, to })}` : to);
  }

  return (
    <>
      <AppHeader user={user} active="/dashboard/students" />
      <StudentsTable
        initialClassId={classId}
        initialReview={params.review === "1"}
      />
    </>
  );
}
