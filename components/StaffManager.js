
"use client";

import { useEffect, useState } from "react";
import { redirectIfSignedOut, SESSION_EXPIRED } from "./session";
import { formatDate } from "../lib/arabic";
import { SHIFTS, formatMoney } from "../lib/labels";
import { CONTRACT_SUGGESTIONS, JOB_SUGGESTIONS } from "../lib/staff";

export async function send(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store"
  });

  if (redirectIfSignedOut(response)) throw new Error(SESSION_EXPIRED);

  const data = await response.json();

  if (!response.ok) {
    throw Object.assign(new Error(data.error || "تعذر الحفظ."), { field: data.field });
  }

  return data;
}

export const control = {
  padding: "8px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: "6px",
  backgroundColor: "#ffffff",
  boxSizing: "border-box"
};

const cell = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "right", whiteSpace: "nowrap" };
const money = { ...cell, textAlign: "left", fontVariantNumeric: "tabular-nums" };

// الكادر: the columns of the school's staff.xlsx, one person per row.
export default function StaffManager() {
  const [staff, setStaff] = useState([]);
  const [editing, setEditing] = useState(null); // null | "new" | staff id
  const [error, setError] = useState("");

  async function load() {
    try {
      setStaff((await send("/api/staff", "GET")).staff);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const saved = () => { setEditing(null); load(); };
  const active = staff.filter((s) => s.isActive);
  const total = (field) => active.reduce((sum, s) => sum + (s[field] || 0), 0);
  const jobs = [...new Set([...JOB_SUGGESTIONS, ...staff.map((s) => s.job).filter(Boolean)])];

  return (
    <>
      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}

      {editing === "new" ? (
        <StaffForm jobs={jobs} onCancel={() => setEditing(null)} onSaved={saved} />
      ) : (
        <button
          type="button"
          onClick={() => setEditing("new")}
          style={{ padding: "9px 18px", backgroundColor: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", marginBottom: "14px" }}
        >
          + موظف جديد
        </button>
      )}

      <div style={{ backgroundColor: "#ffffff", borderRadius: "12px", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#eff6ff", color: "#1e40af" }}>
              <th style={cell}>ت</th>
              <th style={cell}>الاسم</th>
              <th style={cell}>الوظيفة</th>
              <th style={cell}>الدوام</th>
              <th style={cell}>رقم الهاتف</th>
              <th style={money}>الراتب الاسمي</th>
              <th style={money}>المكافآت</th>
              <th style={cell}>بداية العمل</th>
              <th style={cell}>العقد</th>
              <th style={cell}>الحالة</th>
              <th style={cell} />
            </tr>
          </thead>
          <tbody>
            {staff.map((person, index) =>
              editing === person.id ? (
                <tr key={person.id}>
                  <td colSpan={11} style={{ ...cell, whiteSpace: "normal", backgroundColor: "#f8fafc" }}>
                    <StaffForm person={person} jobs={jobs} onCancel={() => setEditing(null)} onSaved={saved} />
                  </td>
                </tr>
              ) : (
                <tr key={person.id} style={{ opacity: person.isActive ? 1 : 0.55 }}>
                  <td style={cell}>{index + 1}</td>
                  <td style={{ ...cell, fontWeight: 600 }} title={person.notes || undefined}>{person.name}</td>
                  <td style={cell}>{person.job || "—"}</td>
                  <td style={cell}>{SHIFTS[person.shift] || "—"}</td>
                  <td style={cell} dir="ltr">{person.phone || "—"}</td>
                  <td style={money}>{person.baseSalary === null ? "—" : formatMoney(person.baseSalary)}</td>
                  <td style={money}>{person.bonus === null ? "—" : formatMoney(person.bonus)}</td>
                  <td style={cell}>{formatDate(person.startDate) || "—"}</td>
                  <td style={cell}>{person.contract || "—"}</td>
                  <td style={cell}>{person.isActive ? "نشط" : "غير نشط"}</td>
                  <td style={cell}>
                    <button type="button" onClick={() => setEditing(person.id)}>✎ تعديل</button>
                  </td>
                </tr>
              )
            )}
            {staff.length === 0 && (
              <tr><td colSpan={11} style={{ ...cell, color: "#64748b" }}>لا يوجد موظفون بعد.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: "bold", backgroundColor: "#f8fafc" }}>
              <td style={cell} colSpan={5}>المجموع (النشطون: {active.length})</td>
              <td style={money}>{formatMoney(total("baseSalary"))}</td>
              <td style={money}>{formatMoney(total("bonus"))}</td>
              <td style={cell} colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

const FIELDS = [
  ["name", "الاسم", { required: true, autoFocus: true, maxLength: 191 }],
  ["job", "الوظيفة", { list: "staff-jobs", maxLength: 191 }],
  ["shift", "أوقات الدوام"],
  ["phone", "رقم الهاتف", { dir: "ltr", inputMode: "tel", maxLength: 30 }],
  ["birthDate", "المواليد", { type: "date" }],
  ["address", "السكن", { maxLength: 500 }],
  ["education", "التحصيل الدراسي", { maxLength: 191 }],
  ["baseSalary", "الراتب الاسمي", { dir: "ltr", inputMode: "numeric" }],
  ["bonus", "المكافآت", { dir: "ltr", inputMode: "numeric" }],
  ["startDate", "بداية العمل", { type: "date" }],
  ["contract", "العقد", { list: "staff-contract", maxLength: 191, placeholder: "نعم / لا أو تفاصيل" }]
];

function StaffForm({ person, jobs, onCancel, onSaved }) {
  const isNew = !person;
  const [form, setForm] = useState(() => {
    const initial = { notes: person?.notes ?? "", isActive: person?.isActive ?? true };
    for (const [field] of FIELDS) initial[field] = person?.[field] ?? "";
    return initial;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const border = (field) => (error?.field === field ? { borderColor: "#dc2626" } : undefined);
  const label = { display: "grid", gap: "4px", fontSize: "13px", color: "#475569" };

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      await send(isNew ? "/api/staff" : `/api/staff/${person.id}`, isNew ? "POST" : "PATCH", form);
      onSaved();
    } catch (err) {
      setError({ message: err.message, field: err.field });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`حذف ${person.name} نهائياً؟`)) return;
    setBusy(true);
    try {
      await send(`/api/staff/${person.id}`, "DELETE");
      onSaved();
    } catch (err) {
      setError({ message: err.message });
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onCancel(); } }}
      style={{ display: "grid", gap: "12px", padding: "14px", backgroundColor: "#ffffff", borderRadius: "12px", marginBottom: "14px" }}
    >
      <strong style={{ color: "#1e40af" }}>{isNew ? "موظف جديد" : `تعديل: ${person.name}`}</strong>

      <datalist id="staff-jobs">{jobs.map((j) => <option key={j} value={j} />)}</datalist>
      <datalist id="staff-contract">{CONTRACT_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px" }}>
        {FIELDS.map(([field, text, props]) => (
          <label key={field} style={label}>
            {text}
            {field === "shift" ? (
              <select value={form.shift} onChange={(e) => set("shift", e.target.value)} style={{ ...control, ...border("shift") }}>
                <option value="">—</option>
                {Object.entries(SHIFTS).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
              </select>
            ) : (
              <input
                {...props}
                value={form[field]}
                onChange={(e) => set(field, e.target.value)}
                style={{ ...control, ...border(field) }}
              />
            )}
          </label>
        ))}
      </div>

      <label style={label}>
        ملاحظات شخصية
        <textarea rows={2} maxLength={5000} value={form.notes} onChange={(e) => set("notes", e.target.value)} style={control} />
      </label>

      <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
        <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
        نشط (غير النشط لا يظهر في رواتب الأشهر القادمة)
      </label>

      {error && <p role="alert" style={{ color: "#dc2626", margin: 0 }}>{error.message}</p>}

      <div style={{ display: "flex", gap: "8px" }}>
        <button type="submit" disabled={busy} style={{ padding: "9px 22px", backgroundColor: "#2563eb", color: "#fff", border: "none", borderRadius: "8px" }}>
          {busy ? "جارٍ الحفظ..." : "حفظ"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>إلغاء</button>
        {!isNew && (
          <button type="button" disabled={busy} onClick={remove} style={{ marginInlineStart: "auto", color: "#b91c1c" }}>
            حذف
          </button>
        )}
      </div>
    </form>
  );
}
