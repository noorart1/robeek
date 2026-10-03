"use client";

// The school year every page shows (lib/year-view.js). Kept in a cookie so
// it survives moving between pages; choosing the active year clears it.
// A full reload, not router.refresh(): the tables load their data in the
// browser and would keep showing the previous year.
export default function YearPicker({ years, selectedId, activeId }) {
  function choose(id) {
    document.cookie = Number(id) === activeId
      ? "year=; path=/; max-age=0; samesite=lax"
      : `year=${id}; path=/; max-age=31536000; samesite=lax`;
    window.location.reload();
  }

  return (
    <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#475569" }}>
      السنة
      <select
        value={selectedId ?? ""}
        onChange={(e) => choose(e.target.value)}
        style={{ padding: "6px 8px", border: "1px solid #cbd5e1", borderRadius: "6px", backgroundColor: "#ffffff" }}
      >
        {years.map((y) => (
          <option key={y.id} value={y.id}>
            {y.name}{y.id === activeId ? " (الحالية)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

export function BackToActiveYear() {
  return (
    <button
      type="button"
      onClick={() => {
        document.cookie = "year=; path=/; max-age=0; samesite=lax";
        window.location.reload();
      }}
    >
      العودة إلى السنة الحالية
    </button>
  );
}
