
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { redirectIfSignedOut, SESSION_EXPIRED } from "./session";

// The section's teacher (المرشدة), editable in place on the dashboard.
// Enter saves, Escape cancels; an empty name clears it.

export default function TeacherCell({ classId, teacherName, sectionName }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function start() {
    setDraft(teacherName || "");
    setError("");
    setEditing(true);
  }

  async function save(event) {
    event.preventDefault();
    if (busy) return;

    if (draft.trim() === (teacherName || "")) {
      setEditing(false);
      return;
    }

    setBusy(true);
    setError("");

    try {
      const response = await fetch(`/api/classes/${classId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherName: draft })
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
      <form onSubmit={save} style={{ display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" }}>
        <input
          aria-label={`مرشدة الشعبة ${sectionName}`}
          placeholder="اسم المرشدة"
          autoFocus
          maxLength={100}
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setEditing(false);
            }
          }}
          style={{
            width: "120px",
            padding: "5px 7px",
            border: `1px solid ${error ? "#dc2626" : "#cbd5e1"}`,
            borderRadius: "6px"
          }}
        />
        <button type="submit" disabled={busy}>{busy ? "..." : "حفظ"}</button>
        <button type="button" disabled={busy} onClick={() => setEditing(false)}>إلغاء</button>
        {error && <small role="alert" style={{ color: "#dc2626", width: "100%" }}>{error}</small>}
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      title="تعديل اسم المرشدة"
      style={{
        background: "none",
        border: "none",
        padding: "2px 0",
        cursor: "pointer",
        color: teacherName ? "#475569" : "#94a3b8",
        display: "inline-flex",
        gap: "4px",
        alignItems: "center"
      }}
    >
      {teacherName || "+ إضافة مرشدة"}
      {teacherName && <span style={{ color: "#94a3b8", fontSize: "12px" }}>✎</span>}
    </button>
  );
}
