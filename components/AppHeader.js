
import Link from "next/link";
import LogoutButton from "./LogoutButton";

// Teachers see attendance only; the pages themselves enforce the same.
const links = [
  { href: "/dashboard", label: "الرئيسية", roles: ["ADMIN"] },
  { href: "/dashboard/students", label: "الأطفال", roles: ["ADMIN"] },
  { href: "/dashboard/attendance", label: "الحضور", roles: ["ADMIN", "TEACHER"] },
  { href: "/dashboard/finance", label: "المالية", roles: ["ADMIN"] },
  { href: "/dashboard/lines", label: "الخطوط", roles: ["ADMIN"] },
  { href: "/dashboard/users", label: "المستخدمون", roles: ["ADMIN"] },
  { href: "/dashboard/backups", label: "النسخ الاحتياطي", roles: ["ADMIN"] }
];

export default function AppHeader({ user, active }) {
  return (
    <header
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
        <LogoutButton />
      </div>
    </header>
  );
}
