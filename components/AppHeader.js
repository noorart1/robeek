
import Link from "next/link";
import LogoutButton from "./LogoutButton";

const links = [
  { href: "/dashboard", label: "الرئيسية" },
  { href: "/dashboard/students", label: "الأطفال" },
  { href: "/dashboard/finance", label: "المالية" },
  { href: "/dashboard/lines", label: "الخطوط" }
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
        href="/dashboard"
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
        {links.map(({ href, label }) => (
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
        <span style={{ color: "#64748b" }}>{user.fullName}</span>
        <LogoutButton />
      </div>
    </header>
  );
}
