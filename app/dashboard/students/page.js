
import { requirePageUser } from "../../../lib/auth";
import AppHeader from "../../../components/AppHeader";
import StudentsTable from "../../../components/StudentsTable";

export const dynamic = "force-dynamic";

// ?class=<id> and ?review=1 preset the table's filters (links from the
// dashboard); ?term=summer shows الدورة الصيفية. The year is the header's.
export default async function StudentsPage({ searchParams }) {
  const user = await requirePageUser(["ADMIN", "DEPUTY"]);

  const params = await searchParams;

  return (
    <>
      <AppHeader user={user} active="/dashboard/students" />
      <StudentsTable
        initialClassId={typeof params.class === "string" ? params.class : ""}
        initialReview={params.review === "1"}
        term={params.term === "summer" ? "summer" : ""}
      />
    </>
  );
}
