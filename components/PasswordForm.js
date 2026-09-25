
"use client";

import { useState } from "react";
import { redirectIfSignedOut, SESSION_EXPIRED } from "./session";

const empty = { currentPassword: "", newPassword: "", confirmPassword: "" };

export default function PasswordForm() {
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (busy) return;

    setError(null);
    setDone("");

    if (form.newPassword !== form.confirmPassword) {
      setError({ field: "confirmPassword", message: "كلمتا المرور الجديدتان غير متطابقتين." });
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword
        })
      });

      if (redirectIfSignedOut(response)) throw new Error(SESSION_EXPIRED);

      const data = await response.json();

      if (!response.ok) {
        setError({ field: data.field, message: data.error || "تعذر تغيير كلمة المرور." });
        return;
      }

      setForm(empty);
      setDone(
        data.otherSessionsEnded
          ? `تم تغيير كلمة المرور، وتم تسجيل الخروج من ${data.otherSessionsEnded} أجهزة أخرى.`
          : "تم تغيير كلمة المرور."
      );
    } catch (err) {
      setError({ message: err.message || "تعذر الاتصال بالخادم." });
    } finally {
      setBusy(false);
    }
  }

  const input = (name) => ({
    id: `password-${name}`,
    type: "password",
    required: true,
    value: form[name],
    disabled: busy,
    onChange: (event) => setForm((f) => ({ ...f, [name]: event.target.value })),
    style: {
      width: "100%",
      boxSizing: "border-box",
      padding: "10px",
      border: `1px solid ${error?.field === name ? "#dc2626" : "#cbd5e1"}`,
      borderRadius: "8px",
      fontSize: "16px"
    }
  });

  const label = { display: "grid", gap: "4px", marginBottom: "14px", color: "#475569" };

  return (
    <form onSubmit={submit} style={{ maxWidth: "380px" }}>
      <label style={label}>
        كلمة المرور الحالية
        <input {...input("currentPassword")} autoComplete="current-password" />
      </label>

      <label style={label}>
        كلمة المرور الجديدة
        <input {...input("newPassword")} autoComplete="new-password" minLength={12} />
        <small style={{ color: "#64748b" }}>
          ١٢ حرفاً على الأقل. عبارة طويلة يسهل تذكرها أفضل من كلمة قصيرة معقدة.
        </small>
      </label>

      <label style={label}>
        تأكيد كلمة المرور الجديدة
        <input {...input("confirmPassword")} autoComplete="new-password" />
      </label>

      {error && <p role="alert" style={{ color: "#dc2626" }}>{error.message}</p>}
      {done && <p role="status" style={{ color: "#15803d" }}>✓ {done}</p>}

      <button
        type="submit"
        disabled={busy}
        style={{
          padding: "11px 26px",
          backgroundColor: "#2563eb",
          color: "#ffffff",
          border: "none",
          borderRadius: "8px",
          cursor: busy ? "wait" : "pointer"
        }}
      >
        {busy ? "جارٍ الحفظ..." : "تغيير كلمة المرور"}
      </button>
    </form>
  );
}
