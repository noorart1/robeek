
"use client";

import { useEffect, useRef, useState } from "react";
import StudentPhoto from "./StudentPhoto";
import { redirectIfSignedOut, SESSION_EXPIRED } from "./session";
import { formatDate } from "../lib/arabic";
import { ATTENDANCE_STATUSES, classLabel, fullName } from "../lib/labels";
import {
  WEEKDAYS,
  addDays,
  iraqToday,
  isWeekend,
  schoolWeek,
  weekday
} from "../lib/dates";

const STORAGE_KEY = "attendance-class";

function readStoredClass() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

// Previous / next school day, skipping Friday and Saturday.
function stepSchoolDay(day, direction) {
  let next = addDays(day, direction);
  while (isWeekend(next)) next = addDays(next, direction);
  return next;
}

export default function AttendanceBoard() {
  const today = iraqToday();

  const [classes, setClasses] = useState([]);
  const [classesLoaded, setClassesLoaded] = useState(false);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(isWeekend(today) ? stepSchoolDay(today, -1) : today);
  const [view, setView] = useState("day");
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(0);
  const requestId = useRef(0);

  const week = schoolWeek(date);
  const from = date < week[0] ? date : week[0];
  const to = date > week[4] ? date : week[4];

  useEffect(() => {
    fetch("/api/options", { cache: "no-store" })
      .then(async (response) => {
        if (redirectIfSignedOut(response)) throw new Error(SESSION_EXPIRED);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        setClasses(data.classes);
        setClassesLoaded(true);
        const stored = readStoredClass();
        const initial =
          data.classes.find((c) => String(c.id) === stored) || data.classes[0];
        if (initial) setClassId(String(initial.id));
      })
      .catch((err) => setError(err.message || "تعذر تحميل الشعب."));
  }, []);

  useEffect(() => {
    if (!classId) return;

    try {
      localStorage.setItem(STORAGE_KEY, classId);
    } catch {
      // Private browsing: just don't remember the choice.
    }

    const id = ++requestId.current;
    setLoading(true);
    setError("");

    fetch(`/api/attendance?classId=${classId}&from=${from}&to=${to}`, { cache: "no-store" })
      .then(async (response) => {
        if (redirectIfSignedOut(response)) throw new Error(SESSION_EXPIRED);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (id === requestId.current) setStudents(data.students);
      })
      .catch((err) => {
        if (id === requestId.current) setError(err.message || "تعذر تحميل الحضور.");
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [classId, from, to]);

  // Optimistic: the buttons change at once, and revert if the save fails.
  async function save(day, changes) {
    const before = students;

    setStudents((current) =>
      current.map((student) => {
        const change = changes.find((c) => c.studentId === student.id);
        if (!change) return student;

        const attendance = { ...student.attendance };
        if (change.status === null) {
          delete attendance[day];
        } else {
          attendance[day] = {
            status: change.status,
            notes: change.notes !== undefined ? change.notes : attendance[day]?.notes ?? null
          };
        }
        return { ...student, attendance };
      })
    );

    setSaving((n) => n + 1);
    setError("");

    try {
      const response = await fetch("/api/attendance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: day, entries: changes })
      });

      if (redirectIfSignedOut(response)) throw new Error(SESSION_EXPIRED);

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر حفظ الحضور.");
    } catch (err) {
      setStudents(before);
      setError(err.message || "تعذر حفظ الحضور.");
    } finally {
      setSaving((n) => n - 1);
    }
  }

  function setStatus(student, status) {
    const current = student.attendance[date]?.status;
    save(date, [{ studentId: student.id, status: current === status ? null : status }]);
  }

  function markAllPresent() {
    const unmarked = students.filter((s) => !s.attendance[date]);
    if (unmarked.length === 0) return;
    save(date, unmarked.map((s) => ({ studentId: s.id, status: "PRESENT" })));
  }

  function saveNote(student, notes) {
    const record = student.attendance[date];
    if (!record || (record.notes || "") === notes.trim()) return;
    save(date, [{ studentId: student.id, status: record.status, notes }]);
  }

  const counts = Object.fromEntries(
    Object.keys(ATTENDANCE_STATUSES).map((status) => [
      status,
      students.filter((s) => s.attendance[date]?.status === status).length
    ])
  );
  const unmarkedCount = students.filter((s) => !s.attendance[date]).length;

  const control = {
    padding: "8px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    backgroundColor: "#ffffff"
  };

  const tab = (value, label) => (
    <button
      type="button"
      aria-pressed={view === value}
      onClick={() => setView(value)}
      style={{
        ...control,
        cursor: "pointer",
        backgroundColor: view === value ? "#2563eb" : "#ffffff",
        color: view === value ? "#ffffff" : "#1e293b",
        borderColor: view === value ? "#2563eb" : "#cbd5e1"
      }}
    >
      {label}
    </button>
  );

  const cls = classes.find((c) => String(c.id) === classId);

  // A week forward never lands in the future: it stops at today.
  const nextDate =
    view === "day"
      ? stepSchoolDay(date, 1)
      : addDays(date, 7) > today ? today : addDays(date, 7);

  // A teacher account with no section assigned yet.
  if (classesLoaded && classes.length === 0) {
    return (
      <main style={{ maxWidth: "700px", margin: "40px auto", padding: "0 16px" }}>
        <h1 style={{ color: "#1e40af" }}>الحضور والغياب</h1>
        <p style={{ padding: "16px", backgroundColor: "#fffbeb", borderRadius: "10px" }}>
          لم تُسند إليك أي شعبة بعد. يرجى مراجعة الإدارة.
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: "1100px", margin: "16px auto", padding: "0 16px" }}>
      <h1 style={{ color: "#1e40af", margin: "0 0 12px" }}>الحضور والغياب</h1>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
        <select
          aria-label="الشعبة"
          value={classId}
          onChange={(event) => setClassId(event.target.value)}
          style={control}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {classLabel(c)}{c.teacherName ? ` — ${c.teacherName}` : ""}
            </option>
          ))}
        </select>

        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <button
            type="button"
            aria-label={view === "day" ? "اليوم السابق" : "الأسبوع السابق"}
            onClick={() => setDate(view === "day" ? stepSchoolDay(date, -1) : addDays(date, -7))}
            style={{ ...control, cursor: "pointer" }}
          >
            →
          </button>
          <input
            type="date"
            aria-label="التاريخ"
            value={date}
            max={today}
            onChange={(event) => event.target.value && setDate(event.target.value)}
            style={control}
          />
          <button
            type="button"
            aria-label={view === "day" ? "اليوم التالي" : "الأسبوع التالي"}
            disabled={nextDate > today || (view === "week" && week[4] >= today)}
            onClick={() => setDate(nextDate)}
            style={{ ...control, cursor: "pointer" }}
          >
            ←
          </button>
          {date !== today && !isWeekend(today) && (
            <button type="button" onClick={() => setDate(today)} style={{ ...control, cursor: "pointer" }}>
              اليوم
            </button>
          )}
        </div>

        <div role="group" aria-label="طريقة العرض" style={{ display: "flex", gap: "4px" }}>
          {tab("day", "تسجيل اليوم")}
          {tab("week", "الأسبوع")}
        </div>

        <span style={{ marginInlineStart: "auto", color: "#64748b", fontSize: "13px" }}>
          {saving > 0 ? "جارٍ الحفظ..." : loading ? "جارٍ التحميل..." : ""}
        </span>
      </div>

      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}

      {view === "day" ? (
        <>
          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              alignItems: "center",
              padding: "12px 14px",
              backgroundColor: "#ffffff",
              borderRadius: "12px",
              marginBottom: "10px"
            }}
          >
            <strong style={{ fontSize: "17px" }}>
              {WEEKDAYS[weekday(date)]} {formatDate(date)}
            </strong>
            {cls && <span style={{ color: "#64748b" }}>— {classLabel(cls)}</span>}
            {isWeekend(date) && (
              <span style={{ color: "#b45309" }}>(عطلة نهاية الأسبوع)</span>
            )}

            <span style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginInlineStart: "auto" }}>
              {Object.entries(ATTENDANCE_STATUSES).map(([status, s]) => (
                <span key={status} style={{ color: s.color }}>
                  {s.label}: <strong>{counts[status]}</strong>
                </span>
              ))}
              <span style={{ color: "#64748b" }}>
                غير مسجل: <strong>{unmarkedCount}</strong>
              </span>
            </span>

            <button
              type="button"
              onClick={markAllPresent}
              disabled={unmarkedCount === 0}
              title="يسجّل «حاضر» لكل من لم يُسجَّل بعد، دون تغيير من سُجّل"
              style={{
                padding: "8px 16px",
                backgroundColor: unmarkedCount ? "#15803d" : "#94a3b8",
                color: "#ffffff",
                border: "none",
                borderRadius: "8px",
                cursor: unmarkedCount ? "pointer" : "default"
              }}
            >
              ✓ الكل حاضر ({unmarkedCount})
            </button>
          </div>

          <div style={{ backgroundColor: "#ffffff", borderRadius: "12px", overflow: "hidden" }}>
            {students.map((student, index) => {
              const record = student.attendance[date];

              return (
                <div
                  key={student.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    flexWrap: "wrap",
                    padding: "8px 12px",
                    borderBottom: "1px solid #f1f5f9",
                    backgroundColor: record ? ATTENDANCE_STATUSES[record.status].background + "55" : undefined
                  }}
                >
                  <span style={{ width: "24px", color: "#94a3b8" }}>{index + 1}</span>
                  <StudentPhoto student={student} size={34} />
                  <span style={{ flex: "1 1 180px", fontWeight: 600 }}>{fullName(student)}</span>

                  <span role="group" aria-label={`حضور ${fullName(student)}`} style={{ display: "flex", gap: "4px" }}>
                    {Object.entries(ATTENDANCE_STATUSES).map(([status, s]) => {
                      const active = record?.status === status;

                      return (
                        <button
                          key={status}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setStatus(student, status)}
                          style={{
                            minWidth: "62px",
                            padding: "8px 10px",
                            borderRadius: "8px",
                            border: `1px solid ${active ? s.color : "#e2e8f0"}`,
                            backgroundColor: active ? s.color : "#ffffff",
                            color: active ? "#ffffff" : s.color,
                            fontWeight: active ? 700 : 400,
                            cursor: "pointer"
                          }}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </span>

                  {record && record.status !== "PRESENT" && (
                    <input
                      key={`${student.id}-${date}-${record.notes || ""}`}
                      aria-label={`ملاحظة ${fullName(student)}`}
                      placeholder="السبب / ملاحظة"
                      defaultValue={record.notes || ""}
                      maxLength={200}
                      onBlur={(event) => saveNote(student, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                          event.preventDefault();
                          event.currentTarget.blur();
                        }
                      }}
                      style={{ ...control, padding: "6px 8px", flex: "1 1 160px" }}
                    />
                  )}
                </div>
              );
            })}

            {!loading && students.length === 0 && (
              <p style={{ padding: "16px", color: "#64748b" }}>لا يوجد أطفال نشطون في هذه الشعبة.</p>
            )}
          </div>
        </>
      ) : (
        <WeekView
          students={students}
          week={week}
          today={today}
          onPickDay={(day) => {
            setDate(day);
            setView("day");
          }}
        />
      )}
    </main>
  );
}

// Like the workbook's الغياب sheet: children × Sunday–Thursday.
function WeekView({ students, week, today, onPickDay }) {
  const cell = {
    padding: "7px 8px",
    borderBottom: "1px solid #e2e8f0",
    textAlign: "center",
    whiteSpace: "nowrap"
  };

  const countOf = (student, status) =>
    week.filter((day) => student.attendance[day]?.status === status).length;

  return (
    <div style={{ overflowX: "auto", backgroundColor: "#ffffff", borderRadius: "12px" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ backgroundColor: "#eff6ff", color: "#1e40af" }}>
            <th style={cell}>ت</th>
            <th style={{ ...cell, textAlign: "right" }}>الاسم</th>
            {week.map((day) => (
              <th key={day} style={cell}>
                <button
                  type="button"
                  onClick={() => onPickDay(day)}
                  disabled={day > today}
                  title="تسجيل حضور هذا اليوم"
                  style={{ background: "none", border: "none", color: "inherit", font: "inherit", fontWeight: "bold", cursor: day > today ? "default" : "pointer" }}
                >
                  {WEEKDAYS[weekday(day)]}
                  <br />
                  <small style={{ fontWeight: "normal" }}>{formatDate(day).slice(0, 5)}</small>
                </button>
              </th>
            ))}
            <th style={{ ...cell, color: ATTENDANCE_STATUSES.ABSENT.color }}>الغياب</th>
            <th style={{ ...cell, color: ATTENDANCE_STATUSES.LATE.color }}>التأخير</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student, index) => (
            <tr key={student.id}>
              <td style={{ ...cell, color: "#94a3b8" }}>{index + 1}</td>
              <td style={{ ...cell, textAlign: "right", fontWeight: 600 }}>{fullName(student)}</td>
              {week.map((day) => {
                const record = student.attendance[day];
                const s = record && ATTENDANCE_STATUSES[record.status];

                return (
                  <td
                    key={day}
                    title={s ? `${s.label}${record.notes ? ` — ${record.notes}` : ""}` : "غير مسجل"}
                    style={{
                      ...cell,
                      color: s?.color || "#cbd5e1",
                      backgroundColor: s?.background,
                      fontWeight: "bold"
                    }}
                  >
                    {s ? s.short : "·"}
                  </td>
                );
              })}
              <td style={{ ...cell, fontWeight: "bold", color: ATTENDANCE_STATUSES.ABSENT.color }}>
                {countOf(student, "ABSENT") || ""}
              </td>
              <td style={{ ...cell, color: ATTENDANCE_STATUSES.LATE.color }}>
                {countOf(student, "LATE") || ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ padding: "8px 12px", margin: 0, color: "#64748b", fontSize: "13px" }}>
        {Object.values(ATTENDANCE_STATUSES).map((s) => `${s.short} ${s.label}`).join("   ")}   · غير مسجل
      </p>
    </div>
  );
}
