"use client";

import { yearLabel } from "../lib/labels";

// The school year every page shows (lib/year-view.js), or a summer
// course on its own. Both controls go
// through /dashboard/year, which sets or clears the cookie and comes back
// to this page with a full load, so the tables fetch the chosen year.
const goTo = (id) => {
  const here = window.location.pathname + window.location.search;
  window.location.href = `/dashboard/year?${new URLSearchParams({ ...(id && { id }), to: here })}`;
};

export default function YearPicker({ years, selectedId, activeId }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#475569" }}>
      السنة
      <select
        value={selectedId ?? ""}
        onChange={(e) => goTo(Number(e.target.value) === activeId ? null : e.target.value)}
        style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: "6px", backgroundColor: "#ffffff" }}
      >
        {years.map((y) => (
          <option key={y.id} value={y.id}>
            {y.kind === "SUMMER" ? yearLabel(y.name) : y.name}{y.id === activeId ? " (الحالية)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

export function BackToActiveYear() {
  return (
    <button type="button" onClick={() => goTo(null)}>
      العودة إلى السنة الحالية
    </button>
  );
}
