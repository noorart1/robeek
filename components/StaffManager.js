
"use client";

import { useEffect, useRef, useState } from "react";
import { redirectIfSignedOut, SESSION_EXPIRED } from "./session";
import { closeOnBackdrop, confirmDiscard } from "./dialog";
import { formatDate } from "../lib/arabic";
import { iraqToday } from "../lib/dates";
import { GENDERS, PAYMENT_METHODS, SALARY_PAYMENT_TYPES, SHIFTS, formatMoney, salaryPaymentLabel } from "../lib/labels";
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
  // Former staff (every one after a new school year) are hidden until asked for.
  const [showInactive, setShowInactive] = useState(false);
  // An earlier year chosen in the header: everyone who worked then.
  const [pastYear, setPastYear] = useState(null);

  async function load() {
    try {
      const data = await send("/api/staff", "GET");
      setStaff(data.staff);
      setPastYear(data.pastYear);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // Salaries recorded under المالية → الرواتب change the pay shown here.
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  const saved = () => { setEditing(null); load(); };
  const active = staff.filter((s) => s.isActive);
  const total = (field) => active.reduce((sum, s) => sum + (s[field] || 0), 0);
  const shown = showInactive || pastYear ? staff : active;
  const inactiveCount = pastYear ? 0 : staff.length - active.length;
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
      {inactiveCount > 0 && (
        <label style={{ marginInlineStart: "14px", color: "#475569" }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />{" "}
          عرض غير النشطين ({inactiveCount})
        </label>
      )}

      <div style={{ backgroundColor: "#ffffff", borderRadius: "12px", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#eff6ff", color: "#1e40af" }}>
              <th style={cell}>ت</th>
              <th style={cell}>الاسم</th>
              <th style={cell}>الجنس</th>
              <th style={cell}>الوظيفة</th>
              <th style={cell}>الدوام</th>
              <th style={cell}>رقم الهاتف</th>
              <th style={money}>الراتب الاسمي</th>
              <th style={cell}>بداية العمل</th>
              <th style={cell}>العقد</th>
              <th style={cell}>الحالة</th>
              <th style={cell} />
            </tr>
          </thead>
          <tbody>
            {shown.map((person, index) => (
                <tr key={person.id} style={{ opacity: person.isActive ? 1 : 0.55 }}>
                  <td style={cell}>{index + 1}</td>
                  <td style={cell} title={person.notes || undefined}>
                    <button
                      type="button"
                      onClick={() => setEditing(person.id)}
                      style={{ background: "none", border: "none", padding: 0, font: "inherit", fontWeight: 600, color: "#1e40af", cursor: "pointer" }}
                    >
                      {person.name}
                    </button>
                  </td>
                  <td style={cell}>{GENDERS[person.gender] || "—"}</td>
                  <td style={cell}>{person.job || "—"}</td>
                  <td style={cell}>{SHIFTS[person.shift] || "—"}</td>
                  <td style={cell} dir="ltr">{person.phone || "—"}</td>
                  <td style={money}>{person.baseSalary === null ? "—" : formatMoney(person.baseSalary)}</td>
                  <td style={cell}>{formatDate(person.startDate) || "—"}</td>
                  <td style={cell}>{person.contract || "—"}</td>
                  <td style={cell}>{person.isActive ? "نشط" : "غير نشط"}</td>
                  <td style={cell}>
                    <button type="button" onClick={() => setEditing(person.id)}>✎ تعديل</button>
                  </td>
                </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={11} style={{ ...cell, color: "#64748b" }}>لا يوجد موظفون بعد.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: "bold", backgroundColor: "#f8fafc" }}>
              <td style={cell} colSpan={6}>المجموع (النشطون: {active.length})</td>
              <td style={money}>{formatMoney(total("baseSalary"))}</td>
              <td style={cell} colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>

      {typeof editing === "number" && (
        <StaffDialog key={editing} id={editing} jobs={jobs} onClose={() => setEditing(null)} onChanged={load} />
      )}
    </>
  );
}

// Like the children's dialog: the person's details, editable, their
// salaries (الرواتب, as الدفعات for a child) and سجل تغيير الراتب.
// onChanged: something was saved, so the page behind should reload.
// From المالية for a معاون: their details shown, not edited
// (staffEditable false), and no payments recorded or voided (readOnly).
export function StaffDialog({ id, jobs, onClose, onChanged, readOnly = false, staffEditable = true }) {
  const dialogRef = useRef(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  // The form's unsaved changes ([label, before, after]): ask before
  // closing, as for a child.
  const dirty = useRef([]);

  function requestClose() {
    if (dirty.current.length > 0 && !confirmDiscard(data ? `تعديل: ${data.staff.name}` : "", dirty.current)) return;
    onClose();
  }

  async function refresh() {
    try {
      setData(await send(`/api/staff/${id}`, "GET"));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    dialogRef.current?.showModal();
    refresh();
  }, [id]);

  const changed = () => { refresh(); onChanged(); };

  return (
    <dialog
      ref={dialogRef}
      dir="rtl"
      onCancel={(event) => { event.preventDefault(); requestClose(); }}
      {...closeOnBackdrop(requestClose)}
      style={{ width: "min(960px, 96vw)", maxHeight: "94vh", padding: 0, border: "none", borderRadius: "14px", boxShadow: "0 20px 60px rgba(15, 23, 42, 0.3)" }}
    >
      <div style={{ padding: "18px 20px", backgroundColor: "#f8fafc" }}>
        {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}
        {!data && !error && <p>جارٍ التحميل...</p>}

        {data && (
          <>
            {staffEditable ? <StaffForm
              key={data.staff.updatedAt}
              person={data.staff}
              jobs={jobs}
              onCancel={requestClose}
              onDirtyChange={(value) => { dirty.current = value; }}
              onSaved={() => { dirty.current = []; changed(); }}
              onDeleted={() => { onChanged(); onClose(); }}
            /> : (
              <h2 style={{ color: "#1e40af", margin: "0 0 12px" }}>
                {data.staff.name}
                {data.staff.job && <small style={{ color: "#64748b", fontWeight: 400 }}> — {data.staff.job}</small>}
              </h2>
            )}
            <Salaries person={data.staff} salaries={data.salaries} payments={data.payments} onChanged={changed} readOnly={readOnly} />
            <PayChanges changes={data.changes} />
          </>
        )}

        <button type="button" onClick={requestClose} style={{ marginTop: "14px", padding: "9px 20px", borderRadius: "8px" }}>
          إغلاق
        </button>
      </div>
    </dialog>
  );
}

const box = { backgroundColor: "#ffffff", borderRadius: "12px", overflowX: "auto" };
const h3 = { color: "#1e40af", margin: "4px 0 8px", fontSize: "16px" };

// الرواتب: like a child's الدفعات — totals, every receipt (voided ones
// struck through), printing, and a form that records a payment at once.
// A month is due الراتب الاسمي unless set otherwise under
// المالية → الرواتب; a payment never exceeds what is left of it.
function Salaries({ person, salaries, payments, onChanged, readOnly }) {
  const thisMonth = iraqToday().slice(0, 7);
  const dueOf = (month) => {
    const salary = salaries.find((s) => s.month === month);
    if (salary) return salary.remaining;
    return person.baseSalary;
  };
  // A refund starts empty: how much comes back is not guessable.
  const blank = (month = thisMonth, paymentType = "SALARY") => ({
    month,
    paymentType,
    amount: paymentType === "SALARY" ? dueOf(month) || "" : "",
    paymentMethod: "CASH",
    paidOn: iraqToday(),
    description: ""
  });
  const [draft, setDraft] = useState(() => blank());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // The payment just recorded, offered for printing.
  const [last, setLast] = useState(null);

  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const print = (url) => window.open(url, "_blank", "noopener");
  const border = (field) => (error?.field === field ? { borderColor: "#dc2626" } : undefined);
  const small = { ...control, padding: "7px" };

  async function add(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { payment } = await send("/api/salaries/payments", "POST", { staffId: person.id, ...draft });
      setLast(payment);
      setDraft((d) => ({ ...d, amount: "", description: "" }));
      onChanged();
    } catch (err) {
      setError({ message: err.message, field: err.field });
    } finally {
      setBusy(false);
    }
  }

  // Receipts are voided, never deleted: the number stays on record.
  async function voidPayment(payment) {
    const label = payment.receiptNo ? `الوصل ${payment.receiptNo}` : "هذه الدفعة";
    const reason = window.prompt(
      `إلغاء ${label} بمبلغ ${formatMoney(payment.amount)} د.ع؟\nيبقى الوصل في السجل مع علامة «ملغى» ولا يُحسب.\n\nسبب الإلغاء (اختياري):`,
      ""
    );
    if (reason === null) return;
    setBusy(true);
    setError(null);
    try {
      await send(`/api/salaries/payments/${payment.id}`, "PATCH", { void: true, reason });
      onChanged();
    } catch (err) {
      setError({ message: err.message });
    } finally {
      setBusy(false);
    }
  }

  const current = salaries.find((s) => s.month === thisMonth);
  const left = current ? current.remaining : dueOf(thisMonth);
  const summary = [
    ["الراتب الاسمي", person.baseSalary],
    ["مستحق هذا الشهر", current ? current.net : dueOf(thisMonth)],
    ["المدفوع هذا الشهر", current?.paid ?? 0, "#15803d"],
    ["الباقي هذا الشهر", left, left > 0 ? "#b91c1c" : undefined],
    ["مجموع المدفوع", salaries.reduce((t, s) => t + s.paid, 0)]
  ];
  // Months still owed something, as for a child's earlier-year debt.
  const owed = salaries.filter((s) => s.remaining > 0 && s.month !== thisMonth);

  const pcell = { padding: "6px 8px", borderBottom: "1px solid #f1f5f9", textAlign: "right" };

  return (
    <>
      <h3 style={h3}>الرواتب</h3>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
        {summary.map(([label, value, color]) => (
          <div key={label} style={{ padding: "8px 14px", backgroundColor: "#ffffff", borderRadius: "8px" }}>
            <div style={{ fontSize: "12px", color: "#64748b" }}>{label}</div>
            <strong style={{ color }}>{value === null || value === undefined ? "—" : formatMoney(value)}</strong>
          </div>
        ))}
      </div>

      {owed.map((s) => (
        <p key={s.id} style={{ margin: "0 0 6px", color: "#b91c1c", fontSize: "13px" }}>
          باقي من راتب <span dir="ltr">{s.month}</span>: <strong>{formatMoney(s.remaining)}</strong> د.ع
          (سجّل دفعته «عن» ذلك الشهر)
        </p>
      ))}

      {last && (
        <p role="status" style={{ margin: "0 0 10px", color: "#15803d" }}>
          ✓ سُجّل {last.paymentType === "REFUND" ? "الاسترجاع" : "الدفعة"} — وصل رقم <strong dir="ltr">{last.receiptNo}</strong>{" "}
          <a href={`/dashboard/receipts/salary/${last.id}`} target="_blank" rel="noopener noreferrer">
            🖨 طباعة الوصل
          </a>
        </p>
      )}

      {payments.some((p) => !p.voidedAt) && (
        <button type="button" onClick={() => print(`/dashboard/receipts/staff/${person.id}`)} style={{ marginBottom: "8px" }}>
          طباعة كل الوصولات
        </button>
      )}

      {payments.length > 0 && (
        <div style={box}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ color: "#64748b" }}>
                <th style={pcell}>الوصل</th>
                <th style={pcell}>التاريخ</th>
                <th style={pcell}>عن شهر</th>
                <th style={pcell}>النوع</th>
                <th style={pcell}>نوع الدفع</th>
                <th style={{ ...pcell, textAlign: "left" }}>المبلغ</th>
                <th style={pcell}>ملاحظة</th>
                <th style={pcell} />
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => {
                const voided = Boolean(p.voidedAt);
                const struck = voided ? { textDecoration: "line-through", color: "#94a3b8" } : undefined;
                return (
                  <tr key={p.id}>
                    <td style={{ ...pcell, ...struck }} dir="ltr">{p.receiptNo || "—"}</td>
                    <td style={{ ...pcell, ...struck }}>{formatDate(p.paidOn) || "—"}</td>
                    <td style={{ ...pcell, ...struck }} dir="ltr">{p.month}</td>
                    <td style={{ ...pcell, ...struck }}>{salaryPaymentLabel(p.paymentType)}</td>
                    <td style={{ ...pcell, ...struck }}>{PAYMENT_METHODS[p.paymentMethod] || "—"}</td>
                    <td style={{ ...pcell, ...(p.paymentType === "REFUND" && { color: "#b91c1c" }), ...struck, textAlign: "left" }}>
                      {p.paymentType === "REFUND" ? "−" : ""}{formatMoney(p.amount)}
                    </td>
                    <td style={pcell}>
                      <span style={struck}>{p.description || ""}</span>
                      {voided && <small style={{ color: "#b91c1c" }}> ملغى{p.voidReason ? `: ${p.voidReason}` : ""}</small>}
                    </td>
                    <td style={{ ...pcell, whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        onClick={() => print(`/dashboard/receipts/salary/${p.id}`)}
                        title="طباعة الوصل"
                        style={{ marginInlineEnd: "6px" }}
                      >
                        طباعة
                      </button>
                      {!voided && !readOnly && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => voidPayment(p)}
                          title="إلغاء الوصل (يبقى في السجل)"
                          style={{ color: "#b91c1c" }}
                        >
                          إلغاء
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!readOnly && <form onSubmit={add} style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginTop: "8px" }}>
        <input
          aria-label="مبلغ الدفعة"
          placeholder="المبلغ"
          inputMode="numeric"
          dir="ltr"
          required
          value={draft.amount}
          onChange={(e) => set("amount", e.target.value)}
          style={{ ...small, ...border("amount"), width: "130px" }}
        />
        <select
          aria-label="نوع الدفعة"
          value={draft.paymentType}
          onChange={(e) => setDraft(blank(draft.month, e.target.value))}
          style={{ ...small, ...border("paymentType") }}
        >
          {Object.entries(SALARY_PAYMENT_TYPES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select>
        <label style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          عن شهر
          <input
            type="month"
            required
            value={draft.month}
            onChange={(e) => e.target.value && setDraft(blank(e.target.value, draft.paymentType))}
            style={{ ...small, ...border("month") }}
          />
        </label>
        <select aria-label="نوع الدفع" value={draft.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} style={small}>
          {Object.entries(PAYMENT_METHODS).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select>
        <input aria-label="تاريخ الدفع" type="date" value={draft.paidOn} onChange={(e) => set("paidOn", e.target.value)} style={{ ...small, ...border("paidOn") }} />
        <input
          aria-label="ملاحظة"
          placeholder="ملاحظة (سلفة، نصف الراتب…)"
          maxLength={500}
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          style={{ ...small, flex: "1 1 180px" }}
        />
        <button type="submit" disabled={busy}>{busy ? "جارٍ الحفظ..." : draft.paymentType === "REFUND" ? "+ تسجيل استرجاع" : "+ إضافة دفعة"}</button>
      </form>}

      {error && <p role="alert" style={{ color: "#dc2626" }}>{error.message}</p>}
    </>
  );
}

// سجل تغيير الراتب: every change of الراتب الاسمي, newest first.
function PayChanges({ changes }) {
  const amount = (value) => (value === null ? "—" : formatMoney(value));
  const pair = (from, to) => (from === to ? amount(to) : <>{amount(from)} → <strong>{amount(to)}</strong></>);

  return (
    <>
      <h3 style={{ ...h3, marginTop: "18px" }}>سجل تغيير الراتب</h3>
      {changes.length === 0 ? (
        <p style={{ color: "#64748b", margin: 0 }}>لم يتغير الراتب منذ بدء التسجيل.</p>
      ) : (
        <div style={box}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ backgroundColor: "#eff6ff", color: "#1e40af" }}>
                <th style={cell}>التاريخ</th>
                <th style={cell}>الراتب الاسمي</th>
                <th style={cell}>بواسطة</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.id}>
                  <td style={cell}>{formatDate(iraqToday(new Date(c.createdAt)))}</td>
                  <td style={cell} dir="ltr">{pair(c.oldBaseSalary, c.newBaseSalary)}</td>
                  <td style={cell}>{c.changedBy || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const FIELDS = [
  ["name", "الاسم", { required: true, autoFocus: true, maxLength: 191 }],
  ["gender", "الجنس"],
  ["job", "الوظيفة", { maxLength: 191, placeholder: "اكتب الوظيفة" }],
  ["shift", "أوقات الدوام"],
  ["phone", "رقم الهاتف", { dir: "ltr", inputMode: "tel", maxLength: 30 }],
  ["birthDate", "المواليد", { type: "date" }],
  ["address", "السكن", { maxLength: 500 }],
  ["education", "التحصيل الدراسي", { maxLength: 191 }],
  ["baseSalary", "الراتب الاسمي", { dir: "ltr", inputMode: "numeric" }],
  ["startDate", "بداية العمل", { type: "date" }],
  ["contract", "العقد", { list: "staff-contract", maxLength: 191, placeholder: "نعم / لا أو تفاصيل" }]
];

function StaffForm({ person, jobs, onCancel, onSaved, onDeleted = onSaved, onDirtyChange }) {
  const isNew = !person;
  const [initial] = useState(() => {
    const values = { notes: person?.notes ?? "", isActive: person?.isActive ?? true };
    for (const [field] of FIELDS) values[field] = person?.[field] ?? "";
    return values;
  });
  const [form, setForm] = useState(initial);
  const labels = { ...Object.fromEntries(FIELDS.map(([field, text]) => [field, text])), notes: "ملاحظات شخصية", isActive: "الحالة" };
  const shown = (key, value) =>
    key === "shift" ? SHIFTS[value] : key === "gender" ? GENDERS[value] : key === "isActive" ? (value ? "نشط" : "غير نشط") : value;
  const changes = Object.keys(initial)
    .filter((key) => String(form[key] ?? "") !== String(initial[key] ?? ""))
    .map((key) => [labels[key], shown(key, initial[key]), shown(key, form[key])]);
  const changeKey = JSON.stringify(changes);
  useEffect(() => { onDirtyChange?.(changes); }, [changeKey]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // الوظيفة: a list (a datalist hid every title but the one already
  // typed), or free text for a new title.
  const [newJob, setNewJob] = useState(false);

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
      onDeleted();
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

      <datalist id="staff-contract">{CONTRACT_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px" }}>
        {FIELDS.map(([field, text, props]) => (
          <label key={field} style={label}>
            {text}
            {field === "shift" || field === "gender" ? (
              <select value={form[field]} onChange={(e) => set(field, e.target.value)} style={{ ...control, ...border(field) }}>
                <option value="">—</option>
                {Object.entries(field === "shift" ? SHIFTS : GENDERS).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
              </select>
            ) : field === "job" && !newJob ? (
              <select
                value={form.job}
                onChange={(e) => (e.target.value === "__new" ? (setNewJob(true), set("job", "")) : set("job", e.target.value))}
                style={{ ...control, ...border("job") }}
              >
                <option value="">—</option>
                {jobs.map((j) => <option key={j} value={j}>{j}</option>)}
                <option value={"__new"}>+ وظيفة أخرى…</option>
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
