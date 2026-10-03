
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { matchesSearch } from "../lib/arabic";
import { AddLine, LineHeader, send } from "./LineEditor";
import PrintButton from "./PrintButton";

const cell = {
  padding: "8px 10px",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "right",
  whiteSpace: "nowrap"
};

const small = {
  padding: "2px 7px",
  border: "1px solid #cbd5e1",
  borderRadius: "5px",
  backgroundColor: "#ffffff",
  cursor: "pointer",
  lineHeight: 1.4
};

function Phone({ value }) {
  if (!value) return null;

  return (
    <a href={`tel:${value}`} dir="ltr" style={{ color: "inherit" }}>
      {value}
    </a>
  );
}

// Search box that lists matching children not already on this line.
function AddRider({ line, students, lineNames, busy, onAdd }) {
  const [query, setQuery] = useState("");

  const riderIds = new Set(line.riders.map((r) => r.id));

  const matches = query.trim()
    ? students
        .filter((s) => !riderIds.has(s.id) && matchesSearch(`${s.name} ${s.classLabel}`, query))
        .slice(0, 8)
    : [];

  function pick(student) {
    setQuery("");
    onAdd(student.id);
  }

  return (
    <div className="no-print" style={{ padding: "10px 14px", position: "relative" }}>
      <input
        type="search"
        aria-label={`إضافة طفل إلى خط ${line.name}`}
        placeholder="+ إضافة طفل: اكتب اسمه..."
        value={query}
        disabled={busy}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setQuery("");
          if (e.key === "Enter" && matches.length > 0) {
            e.preventDefault();
            pick(matches[0]);
          }
        }}
        style={{
          width: "100%",
          padding: "7px 9px",
          border: "1px dashed #93c5fd",
          borderRadius: "6px"
        }}
      />

      {query.trim() && (
        <ul
          style={{
            listStyle: "none",
            margin: "4px 0 0",
            padding: 0,
            border: "1px solid #e2e8f0",
            borderRadius: "6px",
            backgroundColor: "#ffffff"
          }}
        >
          {matches.length === 0 && (
            <li style={{ padding: "8px 10px", color: "#64748b" }}>لا يوجد طفل بهذا الاسم.</li>
          )}

          {matches.map((student) => (
            <li key={student.id}>
              <button
                type="button"
                onClick={() => pick(student)}
                style={{
                  display: "flex",
                  gap: "8px",
                  width: "100%",
                  padding: "8px 10px",
                  border: "none",
                  borderBottom: "1px solid #f1f5f9",
                  background: "none",
                  textAlign: "right",
                  cursor: "pointer"
                }}
              >
                <strong>{student.name}</strong>
                <span style={{ color: "#64748b" }}>{student.classLabel}</span>
                {student.lineId && (
                  <span style={{ color: "#b45309", marginInlineStart: "auto" }}>
                    ينتقل من خط {lineNames[student.lineId]}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LineCard({ line, students, lineNames, search }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function saveRiders(ids) {
    setBusy(true);
    setError(null);

    try {
      // shownIds: only the riders on this page change (not another year's).
      await send(`/api/transport-lines/${line.id}/riders`, "PUT", { studentIds: ids, shownIds: line.riders.map((r) => r.id) });
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const ids = line.riders.map((r) => r.id);

  function move(index, step) {
    const next = [...ids];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    saveRiders(next);
  }

  function remove(rider) {
    if (!window.confirm(`إزالة ${rider.name} من خط ${line.name}؟`)) return;
    saveRiders(ids.filter((id) => id !== rider.id));
  }

  const searching = search.trim() !== "";
  const rows = line.riders
    .map((rider, index) => ({ rider, index }))
    .filter(({ rider }) =>
      matchesSearch(
        `${rider.name} ${rider.classLabel} ${rider.address} ${rider.fatherPhone} ${rider.motherPhone}`,
        search
      )
    );

  return (
    <section
      className="line-card"
      style={{ backgroundColor: "#ffffff", borderRadius: "12px", overflowX: "auto" }}
    >
      <LineHeader
        line={{ id: line.id, name: line.name, driverPhone: line.driverPhone, shift: line.shift, isActive: line.isActive }}
        riders={line.riders.length}
      />

      {line.riders.length === 0 ? (
        <p style={{ color: "#64748b", padding: "4px 14px", margin: 0 }}>
          لا يوجد أطفال على هذا الخط بعد.
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px", opacity: busy ? 0.6 : 1 }}>
          <thead>
            <tr style={{ color: "#64748b" }}>
              {["ت", "الاسم", "الشعبة", "السكن", "رقم الأب", "رقم الأم"].map((h) => (
                <th key={h} style={{ ...cell, fontWeight: "normal" }}>{h}</th>
              ))}
              <th className="no-print" style={cell} aria-label="إجراءات" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ rider, index }) => (
              <tr key={rider.id}>
                <td style={cell}>{index + 1}</td>
                <td style={{ ...cell, whiteSpace: "normal", fontWeight: 600, color: rider.active ? undefined : "#94a3b8" }}>
                  {rider.name}
                  {!rider.active && (
                    <small style={{ marginInlineStart: "6px", color: "#b91c1c", fontWeight: "normal" }}>
                      غير فعال
                    </small>
                  )}
                </td>
                <td style={cell}>{rider.classLabel}</td>
                <td style={{ ...cell, whiteSpace: "normal", minWidth: "140px" }}>{rider.address}</td>
                <td style={cell}><Phone value={rider.fatherPhone} /></td>
                <td style={cell}><Phone value={rider.motherPhone} /></td>
                <td className="no-print" style={{ ...cell, display: "flex", gap: "4px" }}>
                  {!searching && (
                    <>
                      <button
                        type="button"
                        style={small}
                        disabled={busy || index === 0}
                        onClick={() => move(index, -1)}
                        title="تقديم في ترتيب الاستلام"
                        aria-label={`تقديم ${rider.name}`}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        style={small}
                        disabled={busy || index === ids.length - 1}
                        onClick={() => move(index, 1)}
                        title="تأخير في ترتيب الاستلام"
                        aria-label={`تأخير ${rider.name}`}
                      >
                        ▼
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    style={{ ...small, color: "#b91c1c" }}
                    disabled={busy}
                    onClick={() => remove(rider)}
                    title="إزالة من الخط"
                    aria-label={`إزالة ${rider.name} من الخط`}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {error && (
        <p role="alert" style={{ color: "#dc2626", padding: "0 14px" }}>{error}</p>
      )}

      <AddRider
        line={line}
        students={students}
        lineNames={lineNames}
        busy={busy}
        onAdd={(id) => saveRiders([...ids, id])}
      />
    </section>
  );
}

// pastYear: an earlier year chosen in the header; every line its children rode.
export default function LinesBoard({ lines: allLines, students, pastYear = false }) {
  const [search, setSearch] = useState("");
  // Inactive lines (every one after a new school year) are hidden until
  // asked for; their riders are the earlier years' children.
  const [showInactive, setShowInactive] = useState(false);
  const inactiveCount = pastYear ? 0 : allLines.filter((line) => !line.isActive).length;
  const lines = showInactive || pastYear ? allLines : allLines.filter((line) => line.isActive);

  const lineNames = Object.fromEntries(lines.map((line) => [line.id, line.name]));
  const riders = lines.reduce((sum, line) => sum + line.riders.length, 0);

  // While searching, show only lines with a matching child or a matching
  // driver name/phone.
  const visible = lines.filter(
    (line) =>
      !search.trim() ||
      matchesSearch(`${line.name} ${line.driverPhone || ""}`, search) ||
      line.riders.some((r) =>
        matchesSearch(`${r.name} ${r.classLabel} ${r.address} ${r.fatherPhone} ${r.motherPhone}`, search)
      )
  );

  return (
    <>
      <p style={{ color: "#64748b", marginTop: 0 }}>
        {lines.length} خطوط — {riders} طفلاً مشتركاً. ▲▼ ترتيب الاستلام، ✕ إزالة الطفل من الخط.
      </p>

      <div
        className="no-print"
        style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-start", marginBottom: "16px" }}
      >
        <AddLine />
        <input
          type="search"
          aria-label="بحث في الخطوط"
          placeholder="بحث: اسم طفل، سائق، هاتف، سكن..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: "1 1 240px",
            padding: "9px 12px",
            border: "1px solid #cbd5e1",
            borderRadius: "8px"
          }}
        />
        <PrintButton label="🖨 طباعة القوائم" />
        {inactiveCount > 0 && (
          <label style={{ color: "#475569", alignSelf: "center" }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />{" "}
            عرض الخطوط غير النشطة ({inactiveCount})
          </label>
        )}
      </div>

      {lines.length === 0 && <p style={{ color: "#64748b" }}>لا توجد خطوط نقل بعد.</p>}
      {lines.length > 0 && visible.length === 0 && (
        <p style={{ color: "#64748b" }}>لا توجد نتائج.</p>
      )}

      <div
        className="lines-grid"
        style={{
          display: "grid",
          gap: "16px"
        }}
      >
        {visible.map((line) => (
          <LineCard
            key={line.id}
            line={line}
            students={students}
            lineNames={lineNames}
            // A line found by its driver shows all of its children.
            search={matchesSearch(`${line.name} ${line.driverPhone || ""}`, search) ? "" : search}
          />
        ))}
      </div>
    </>
  );
}
