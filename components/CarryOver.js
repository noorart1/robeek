"use client";

import { useEffect, useState } from "react";
import { send } from "./StaffManager";
import { SHIFTS } from "../lib/labels";

const box = { backgroundColor: "#ffffff", borderRadius: "12px", padding: "16px 18px", marginBottom: "16px" };
const item = { display: "flex", alignItems: "center", gap: "6px", padding: "3px 0" };

// One list of ticks, with «تحديد الكل».
function Choices({ title, rows, chosen, setChosen, label, note }) {
  const open = rows.filter((r) => !r.done);
  const all = open.length > 0 && open.every((r) => chosen.has(r.id));

  function toggle(id) {
    const next = new Set(chosen);
    next.has(id) ? next.delete(id) : next.add(id);
    setChosen(next);
  }

  return (
    <section style={box}>
      <h2 style={{ margin: "0 0 4px", fontSize: "18px", color: "#1e40af" }}>
        {title} <small style={{ color: "#64748b", fontWeight: "normal" }}>({chosen.size} من {open.length})</small>
      </h2>
      {note && <p style={{ margin: "0 0 8px", color: "#64748b", fontSize: "14px" }}>{note}</p>}
      {open.length > 0 && (
        <label style={{ ...item, fontWeight: 600 }}>
          <input type="checkbox" checked={all} onChange={() => setChosen(all ? new Set() : new Set(open.map((r) => r.id)))} />
          تحديد الكل
        </label>
      )}
      <div style={{ columns: "260px", columnGap: "24px" }}>
        {rows.map((r) => (
          <label key={r.id} style={{ ...item, color: r.done ? "#94a3b8" : undefined, breakInside: "avoid" }}>
            <input type="checkbox" disabled={r.done} checked={r.done || chosen.has(r.id)} onChange={() => toggle(r.id)} />
            {label(r)}
          </label>
        ))}
        {rows.length === 0 && <p style={{ color: "#64748b", margin: 0 }}>لا يوجد.</p>}
      </div>
    </section>
  );
}

// نقل من السنة السابقة (/api/academic-years/carry-over): tick who comes
// into the new year. Money never comes: fees start at 0.
export default function CarryOver() {
  const [data, setData] = useState(null);
  const [students, setStudents] = useState(new Set());
  const [staff, setStaff] = useState(new Set());
  const [lines, setLines] = useState(new Set());
  const [teachers, setTeachers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function load() {
    try {
      const loaded = await send("/api/academic-years/carry-over", "GET");
      setData(loaded);
      if (!loaded.from) return;
      // Ticked to start with: children who stayed the whole year, staff
      // and lines not yet back.
      setStudents(new Set(loaded.students.filter((s) => !s.left && !s.done).map((s) => s.id)));
      setStaff(new Set(loaded.staff.filter((s) => !s.isActive).map((s) => s.id)));
      setLines(new Set(loaded.lines.filter((l) => !l.isActive).map((l) => l.id)));
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    }
  }

  useEffect(() => { load(); }, []);

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await send("/api/academic-years/carry-over", "POST", {
        studentIds: [...students], staffIds: [...staff], lineIds: [...lines], teachers
      });
      setMessage({
        ok: true,
        text: `✓ نُقل ${r.students} طفل، وفُعّل ${r.staff} موظف و${r.lines} خط، ونُسخت ${r.teachers} مرشدة.` +
          (r.missing.length ? ` لا توجد في السنة الجديدة الشعب: ${r.missing.join("، ")}.` : "")
      });
      await load();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  if (!data) return message ? <p role="alert" style={{ color: "#dc2626" }}>{message.text}</p> : <p>جارٍ التحميل...</p>;
  if (!data.from) return <p style={{ color: "#64748b" }}>لا توجد سنة دراسية سابقة.</p>;

  return (
    <>
      <p style={{ color: "#475569", marginTop: 0 }}>
        من <strong dir="ltr">{data.from}</strong> إلى <strong dir="ltr">{data.to}</strong>. تُنقل البيانات الشخصية فقط:
        كل طفل إلى نفس الشعبة بنفس نوع الدوام، بمبلغ 0 وبلا نوع دفع (يُحدَّدان من نافذة الطفل). الدفعات والديون تبقى في سنتها.
      </p>

      <Choices
        title="الأطفال"
        rows={data.students}
        chosen={students}
        setChosen={setStudents}
        note="الرمادي: موجود في السنة الجديدة. غير المحدد مسبقاً: ترك خلال السنة."
        label={(s) => (
          <>
            <span style={{ color: "#64748b", minWidth: "70px" }}>{SHIFTS[s.shift]} {s.section}</span>
            {s.name}
            {s.left && <small style={{ color: "#b91c1c" }}>ترك</small>}
          </>
        )}
      />

      <Choices
        title="الكادر"
        rows={data.staff.map((s) => ({ ...s, done: s.isActive }))}
        chosen={staff}
        setChosen={setStaff}
        note="الرمادي: نشط في السنة الجديدة."
        label={(s) => <>{s.name}{s.job && <span style={{ color: "#64748b" }}> — {s.job}</span>}</>}
      />

      <Choices
        title="خطوط النقل"
        rows={data.lines.map((l) => ({ ...l, done: l.isActive }))}
        chosen={lines}
        setChosen={setLines}
        note="يعود الأطفال المنقولون إلى خطوطهم تلقائياً."
        label={(l) => <>خط {l.name} <span style={{ color: "#64748b" }}>({SHIFTS[l.shift]})</span></>}
      />

      <section style={box}>
        <label style={item}>
          <input type="checkbox" checked={teachers} onChange={(e) => setTeachers(e.target.checked)} />
          مرشدات الشعب: نسخ مرشدة كل شعبة من السنة السابقة (للشعب التي بلا مرشدة فقط)
        </label>
      </section>

      <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          style={{ padding: "10px 22px", backgroundColor: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" }}
        >
          {busy ? "جارٍ النقل..." : "نقل المحدد"}
        </button>
        {message && (
          <span role={message.ok ? "status" : "alert"} style={{ color: message.ok ? "#15803d" : "#dc2626" }}>
            {message.text}
          </span>
        )}
      </div>
    </>
  );
}
