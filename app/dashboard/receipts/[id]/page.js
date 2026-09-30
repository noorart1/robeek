
import { notFound } from "next/navigation";
import prisma from "../../../../lib/prisma";
import { requirePageUser } from "../../../../lib/auth";
import { loadStudent } from "../../../../lib/student-data";
import AppHeader from "../../../../components/AppHeader";
import PrintButton from "../../../../components/PrintButton";
import Receipt from "../../../../components/Receipt";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }) {
  const user = await requirePageUser(["ADMIN"]);
  const { id } = await params;
  const paymentId = Number(id);

  const payment = Number.isSafeInteger(paymentId) && paymentId > 0
    ? await prisma.payment.findUnique({
        where: { id: paymentId },
        include: { Enrollment: { select: { studentId: true, AcademicYear: { select: { name: true } } } } }
      })
    : null;

  if (!payment) notFound();

  const loaded = await loadStudent(payment.Enrollment.studentId);
  // A summer course payment is shown against the summer enrollment.
  const student = loaded.summer?.enrollment.id === payment.enrollmentId ? { ...loaded, ...loaded.summer } : loaded;

  return (
    <>
      <div className="no-print">
        <AppHeader user={user} active="" />
        <div style={{ maxWidth: "720px", margin: "16px auto 0", padding: "0 20px", display: "flex", gap: "10px", alignItems: "center" }}>
          <PrintButton />
          <span style={{ color: "#64748b" }}>
            {payment.voidedAt ? "هذا الوصل ملغى." : "يُطبع الوصل وحده، بدون القوائم."}
          </span>
        </div>
      </div>

      <Receipt payment={{ ...payment, yearName: payment.Enrollment.AcademicYear.name }} student={student} />
    </>
  );
}
