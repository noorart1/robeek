"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { redirectIfSignedOut, SESSION_EXPIRED } from "./session";

// The section's teacher (المرشدة), chosen on the dashboard from الكادر
// (`staff`, active people), so her name is kept in one place. Choosing
// saves; Escape cancels. A name typed before the link existed shows with
// ⚠ until she is chosen from the list.

export default function TeacherCell({ classId, teacherName, staffId, staff, sectionName }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(value) {
    if (busy) return;
    if (value === "typed") return setEditing(false);

    if (value === String(staffId ?? "") && (value || !teacherName)) {
      setEditing(false);
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch(`/api/classes/${classId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: value ? Number(value) : null })
      });

      if (redirectIfSignedOut(response)) throw new Error(SESSION_EXPIRED);

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر الحفظ.");

      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <span style={{ display: "inline-flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
        <select
          aria-label={`مرشدة الشعبة ${sectionName}`}
          autoFocus
          disabled={busy}
          defaultValue={staffId ?? (teacherName ? "typed" : "")}
          onChange={(event) => save(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setEditing(false);
            }
          }}
          style={{
            maxWidth: "200px",
            padding: "5px 7px",
            border: `1px solid ${error ? "#dc2626" : "#cbd5e1"}`,
            borderRadius: "6px"
          }}
        >
          {teacherName && !staffId && <option value="typed">⚠ {teacherName} (مكتوب يدوياً)</option>}
          <option value="">— بدون مرشدة —</option>
          {staff.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}{person.job ? ` (${person.job})` : ""}
            </option>
          ))}
        </select>
        <button type="button" disabled={busy} onClick={() => setEditing(false)}>إلغاء</button>
        {error && <small role="alert" style={{ color: "#dc2626", width: "100%" }}>{error}</small>}
      </span>
    );
  }

  const unlinked = teacherName && !staffId;

  return (
    <button
      type="button"
      onClick={() => { setError(""); setEditing(true); }}
      title={unlinked ? "اسم مكتوب يدوياً — اختر المرشدة من الكادر" : "تغيير المرشدة"}
      style={{
        background: "none",
        border: "none",
        padding: "2px 0",
        cursor: "pointer",
        color: unlinked ? "#b45309" : teacherName ? "#475569" : "#94a3b8",
        display: "inline-flex",
        gap: "4px",
        alignItems: "center"
      }}
    >
      {unlinked && "⚠ "}
      {teacherName || "+ إضافة مرشدة"}
      {teacherName && <span style={{ color: "#94a3b8", fontSize: "12px" }}>✎</span>}
    </button>
  );
}
