
import Link from "next/link";
import prisma from "../lib/prisma";
import { yearView } from "../lib/year-view";
import LogoutButton from "./LogoutButton";
import YearPicker, { BackToActiveYear } from "./YearPicker";

// Teachers see attendance only; the pages themselves enforce the same.
const links = [
  { href: "/dashboard", label: "الرئيسية", roles: ["ADMIN"] },
  { href: "/dashboard/students", label: "الأطفال", roles: ["ADMIN"] },
  { href: "/dashboard/attendance", label: "الحضور", roles: ["ADMIN", "TEACHER"] },
  { href: "/dashboard/staff", label: "الكادر", roles: ["ADMIN"] },
  { href: "/dashboard/finance", label: "المالية", roles: ["ADMIN"] },
  { href: "/dashboard/lines", label: "الخطوط", roles: ["ADMIN"] },
  { href: "/dashboard/users", label: "المستخدمون", roles: ["ADMIN"] },
  { href: "/dashboard/backups", label: "النسخ الاحتياطي", roles: ["ADMIN"] }
];

// Admins choose the school year every page shows (lib/year-view.js); an
// earlier one is announced under the header, editable like the current.
export default async function AppHeader({ user, active }) {
  const admin = user.role === "ADMIN";
  const [view, years] = admin
    ? await Promise.all([
        yearView(),
        prisma.academicYear.findMany({ where: { kind: "REGULAR" }, select: { id: true, name: true, isActive: true }, orderBy: { name: "desc" } })
      ])
    : [null, []];
  const activeId = years.find((y) => y.isActive)?.id ?? null;

  return (
    <>
    <header
      className="no-print"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "20px",
        flexWrap: "wrap",
        padding: "8px 20px",
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #e2e8f0"
      }}
    >
      <Link
        href={user.role === "TEACHER" ? "/dashboard/attendance" : "/dashboard"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          textDecoration: "none"
        }}
      >
        <img src="/logo.png" alt="" width={44} height={44} />
        <strong style={{ color: "#1e40af", fontSize: "17px" }}>
          روبيك للتعليم المبكر
        </strong>
      </Link>

      <nav style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {links.filter((link) => link.roles.includes(user.role)).map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            aria-current={active === href ? "page" : undefined}
            style={{
              padding: "7px 14px",
              borderRadius: "8px",
              textDecoration: "none",
              color: active === href ? "#ffffff" : "#1e40af",
              backgroundColor:
                active === href ? "#2563eb" : "transparent"
            }}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div
        style={{
          marginInlineStart: "auto",
          display: "flex",
          alignItems: "center",
          gap: "12px"
        }}
      >
        <Link
          href="/dashboard/account"
          title="حسابي — تغيير كلمة المرور"
          aria-current={active === "/dashboard/account" ? "page" : undefined}
          style={{ color: active === "/dashboard/account" ? "#1e40af" : "#64748b", textDecoration: "none" }}
        >
          👤 {user.fullName}
        </Link>
        {years.length > 1 && <YearPicker years={years} selectedId={view.year?.id} activeId={activeId} />}
        <LogoutButton />
      </div>
    </header>
    {view && !view.isActive && (
      <div
        className="no-print"
        role="status"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
          padding: "8px 20px",
          backgroundColor: "#fef3c7",
          color: "#92400e",
          borderBottom: "1px solid #fcd34d"
        }}
      >
        <strong>تعرض الآن السنة الدراسية {view.year.name}، وليست السنة الحالية.</strong>
        <span>التعديلات تُحفظ في هذه السنة.</span>
        <BackToActiveYear />
      </div>
    )}
    </>
  );
}
