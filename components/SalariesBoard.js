
"use client";

import { useEffect, useState } from "react";
import { StaffDialog, control, send } from "./StaffManager";
import { iraqToday } from "../lib/dates";
import { formatDate } from "../lib/arabic";
import { parseAmount } from "../lib/digits";
import { PAYMENT_METHODS, SHIFTS, formatMoney } from "../lib/labels";
import { JOB_SUGGESTIONS, netSalary } from "../lib/staff";

// Compact, so the whole month fits the page without scrolling sideways.
const cell = { padding: "6px 5px", borderBottom: "1px solid #e2e8f0", textAlign: "right", whiteSpace: "nowrap" };
const money = { ...cell, textAlign: "left", fontVariantNumeric: "tabular-nums" };
const small = { ...control, padding: "5px 6px" };

// الرواتب: one row per person for the chosen month — what they are due
// (the person's usual salary until set otherwise), what was paid and what
// is left. «دفع الباقي» pays the rest in one receipt; part payments,
// receipts and voiding are in the person's window (click the name).
export default function SalariesBoard() {
  const [month, setMonth] = useState(() => iraqToday().slice(0, 7));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null); // staff id shown in the dialog
  // The payment just recorded, offered for printing: { staffId, id, receiptNo }.
  const [receipt, setReceipt] = useState(null);

  async function load() {
    try {
      setData(await send(`/api/salaries?month=${month}`, "GET"));
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    setData(null);
    setReceipt(null);
    load();
    // Staff are edited on «الكادر», often in another tab: refetch on return.
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [month]);

  const salaryOf = (id) => data?.salaries.find((s) => s.staffId === id);
  const salaries = data?.salaries ?? [];
  // Totals cover everyone listed: a month not saved yet is due the
  // person's usual salary, as its row shows.
  const rows = (data?.staff ?? []).map((person) => {
    const due = person.baseSalary ?? 0;
    return salaryOf(person.id) ?? { net: due, paid: 0, remaining: due };
  });
  const sum = (field) => rows.reduce((total, s) => total + s[field], 0);

  return (
    <>
      <label style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
        الشهر
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={control} />
      </label>

      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}

      {data && (
        <div style={{ backgroundColor: "#ffffff", borderRadius: "12px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#eff6ff", color: "#1e40af" }}>
                <th style={cell}>الاسم</th>
                <th style={money}>الراتب</th>
                <th style={money}>الخصومات / السلف</th>
                <th style={money}>الصافي</th>
                <th style={money}>المدفوع</th>
                <th style={money}>الباقي</th>
                <th style={cell}>ملاحظات</th>
                <th style={cell} />
              </tr>
            </thead>
            <tbody>
              {data.staff.map((person) => {
                const salary = salaryOf(person.id);
                // An unsaved row restarts from the person's current salary once «الكادر» changes it.
                return (
                  <SalaryRow
                    key={`${month}-${person.id}-${salary ? `${salary.updatedAt}-${salary.paid}` : `new-${person.baseSalary}`}`}
                    person={person}
                    salary={salary}
                    month={month}
                    receipt={receipt?.staffId === person.id ? receipt : null}
                    onPaid={(payment) => setReceipt({ staffId: person.id, ...payment })}
                    onSaved={load}
                    onOpen={() => setOpen(person.id)}
                  />
                );
              })}
              {data.staff.length === 0 && (
                <tr><td colSpan={8} style={{ ...cell, color: "#64748b" }}>لا يوجد موظفون نشطون. أضفهم من صفحة «الكادر».</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: "bold", backgroundColor: "#f8fafc" }}>
                <td style={cell} colSpan={3}>
                  المجموع (مدفوع بالكامل: {salaries.filter((s) => s.remaining <= 0).length} من {data.staff.length})
                </td>
                <td style={money}>{formatMoney(sum("net"))}</td>
                <td style={{ ...money, color: "#15803d" }}>{formatMoney(sum("paid"))}</td>
                <td style={{ ...money, color: sum("remaining") > 0 ? "#b91c1c" : undefined }}>{formatMoney(sum("remaining"))}</td>
                <td style={cell} colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {data?.lumps?.length > 0 && (
        <p style={{ marginTop: "12px", padding: "10px 14px", backgroundColor: "#fffbeb", borderRadius: "8px" }}>
          رواتب مسجلة في دفتر الحسابات كمبلغ إجمالي فقط (قبل تسجيل الرواتب لكل موظف):{" "}
          {data.lumps.map((e) => (
            <span key={e.id} style={{ marginInlineEnd: "12px" }}>
              {formatDate(e.date)} — {e.item}: <strong>{formatMoney(e.amount)}</strong> د.ع{e.notes ? ` (${e.notes})` : ""}
            </span>
          ))}
          <br /><small style={{ color: "#64748b" }}>تُحسب في «الملخص» ضمن رواتب الموظفين.</small>
        </p>
      )}

      {open !== null && (
        <StaffDialog
          key={open}
          id={open}
          jobs={[...new Set([...JOB_SUGGESTIONS, ...(data?.staff ?? []).map((s) => s.job).filter(Boolean)])]}
          onClose={() => setOpen(null)}
          onChanged={load}
        />
      )}
    </>
  );
}

function SalaryRow({ person, salary, month, receipt, onPaid, onSaved, onOpen }) {
  const initial = {
    baseSalary: salary?.baseSalary ?? person.baseSalary ?? "",
    deduction: salary?.deduction ?? "",
    notes: salary?.notes ?? ""
  };
  const [form, setForm] = useState(initial);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const border = (field) => (error?.field === field ? { borderColor: "#dc2626" } : undefined);
  const amount = (value) => parseAmount(value) ?? 0;
  const net = netSalary({ baseSalary: amount(form.baseSalary), bonus: salary?.bonus, deduction: amount(form.deduction) });
  const paid = salary?.paid ?? 0;
  const remaining = net - paid;
  const dirty = !salary || Object.keys(initial).some((key) => String(form[key]) !== String(initial[key]));

  const saveSalary = () => send("/api/salaries", "PUT", { staffId: person.id, month, ...form });

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await saveSalary();
      onSaved();
    } catch (err) {
      setError({ message: err.message, field: err.field });
      setBusy(false);
    }
  }

  // دفع الباقي: saves the month's figures first if they were edited.
  async function payRest() {
    if (busy || remaining <= 0) return;
    if (!window.confirm(`دفع ${formatMoney(remaining)} د.ع إلى ${person.name} عن ${month}؟`)) return;
    setBusy(true);
    setError(null);
    try {
      if (dirty) await saveSalary();
      const { payment } = await send("/api/salaries/payments", "POST", {
        staffId: person.id, month, amount: remaining, paymentMethod
      });
      onPaid(payment);
      onSaved();
    } catch (err) {
      setError({ message: err.message, field: err.field });
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`حذف راتب ${person.name} لهذا الشهر؟`)) return;
    setBusy(true);
    try {
      await send(`/api/salaries/${salary.id}`, "DELETE");
      onSaved();
    } catch (err) {
      setError({ message: err.message });
      setBusy(false);
    }
  }

  const input = (field, props = {}) => (
    <input
      {...props}
      form={`salary-${person.id}`}
      value={form[field]}
      onChange={(e) => set(field, e.target.value)}
      style={{ ...small, ...border(field), ...props.style }}
    />
  );
  const amountInput = (field) => input(field, { dir: "ltr", inputMode: "numeric", style: { width: "88px" } });
  const background = salary && remaining <= 0 ? "#f0fdf4" : paid > 0 ? "#fffbeb" : undefined;

  return (
    <tr style={{ backgroundColor: background, opacity: person.isActive ? 1 : 0.6 }}>
      <td style={{ ...cell, whiteSpace: "normal", minWidth: "130px" }}>
        <button
          type="button"
          onClick={onOpen}
          title="الدفعات والوصولات"
          style={{ background: "none", border: "none", padding: 0, font: "inherit", fontWeight: 700, color: "#1e40af", cursor: "pointer" }}
        >
          {person.name}
        </button>
        <div style={{ fontSize: "12px", color: "#64748b" }}>
          {[person.job, SHIFTS[person.shift]].filter(Boolean).join(" — ")}
        </div>
        {receipt && (
          <div role="status" style={{ fontSize: "12px", color: "#15803d" }}>
            ✓ وصل <span dir="ltr">{receipt.receiptNo}</span>{" "}
            <a href={`/dashboard/receipts/salary/${receipt.id}`} target="_blank" rel="noopener noreferrer">🖨 طباعة</a>
          </div>
        )}
        {error && <div role="alert" style={{ color: "#dc2626", fontSize: "12px", whiteSpace: "normal" }}>{error.message}</div>}
      </td>
      <td style={money}>{amountInput("baseSalary")}</td>
      <td style={money}>{amountInput("deduction")}</td>
      <td style={{ ...money, fontWeight: 600 }}>{formatMoney(net)}</td>
      <td style={{ ...money, color: "#15803d" }}>{formatMoney(paid)}</td>
      <td style={{ ...money, fontWeight: 600, color: remaining > 0 ? "#b91c1c" : undefined }}>{formatMoney(remaining)}</td>
      <td style={cell}>{input("notes", { maxLength: 500, title: form.notes || undefined, style: { width: "120px" } })}</td>
      <td style={{ ...cell, whiteSpace: "normal" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center", minWidth: "150px" }}>
          <form id={`salary-${person.id}`} onSubmit={save} style={{ display: "inline" }}>
            <button type="submit" disabled={busy || !dirty} title="حفظ الراتب المستحق لهذا الشهر">حفظ</button>
          </form>
          {remaining > 0 && (
            <>
              <select
                aria-label="نوع الدفع"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                style={small}
              >
                {Object.entries(PAYMENT_METHODS).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
              </select>
              <button type="button" disabled={busy} onClick={payRest} style={{ color: "#15803d", fontWeight: 600 }}>
                دفع الباقي
              </button>
            </>
          )}
          {salary && paid === 0 && (
            <button type="button" disabled={busy} onClick={remove} style={{ color: "#b91c1c" }}>
              حذف
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
