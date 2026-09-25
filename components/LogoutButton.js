
"use client";

import { useState } from "react";

export default function LogoutButton() {
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    if (loading) return;

    setLoading(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
      });

      if (!response.ok) {
        throw new Error("Logout failed");
      }

      window.location.replace("/login");
    } catch {
      alert("تعذر تسجيل الخروج. يرجى المحاولة مرة أخرى.");
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      style={{
        backgroundColor: "#dc2626",
        color: "#ffffff",
        border: "none",
        borderRadius: "8px",
        padding: "8px 18px",
        fontSize: "14px",
        fontFamily: "inherit",
        cursor: loading ? "wait" : "pointer"
      }}
    >
      {loading ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج"}
    </button>
  );
}
