
"use client";

import { useEffect, useState } from "react";
import { control, send } from "./StaffManager";
import { iraqToday } from "../lib/dates";
import { parseAmount } from "../lib/digits";
import { PAYMENT_METHODS, SHIFTS, formatMoney } from "../lib/labels";
import { netSalary } from "../lib/staff";

const cell = { padding: "6px 8px", borderBottom: "1px solid #e2e8f0", textAlign: "right", whiteSpace: "nowrap" };
const money = { ...cell, textAlign: "left", fontVariantNumeric: "tabular-nums" };
const small = { ...control, padding: "5px 6px" };

// الرواتب: one row per person for the chosen month. A row turns green once
// saved; until then it shows the person's usual salary as a starting point.
export default function SalariesBoard() {
  const [month, setMonth] = useState(() => iraqToday().slice(0, 7));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

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
    load();
  }, [month]);

  const salaryOf = (id) => data?.salaries.find((s) => s.staffId === id);
  const paid = data?.salaries ?? [];
  const total = paid.reduce((sum, s) => sum + s.net, 0);

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
                <th style={money}>المكافآت</th>
                <th style={money}>الخصومات / السلف</th>
                <th style={money}>الصافي</th>
                <th style={cell}>تاريخ الدفع</th>
                <th style={cell}>نوع الدفع</th>
                <th style={cell}>ملاحظات</th>
                <th style={cell} />
              </tr>
            </thead>
            <tbody>
              {data.staff.map((person) => {
                const salary = salaryOf(person.id);
                return (
                  <SalaryRow
                    key={`${month}-${person.id}-${salary?.updatedAt ?? "new"}`}
                    person={person}
                    salary={salary}
                    month={month}
                    onSaved={load}
                  />
                );
              })}
              {data.staff.length === 0 && (
                <tr><td colSpan={9} style={{ ...cell, color: "#64748b" }}>لا يوجد موظفون نشطون. أضفهم من صفحة «الكادر».</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: "bold", backgroundColor: "#f8fafc" }}>
                <td style={cell} colSpan={4}>
                  المجموع المدفوع ({paid.length} من {data.staff.length})
                </td>
                <td style={money}>{formatMoney(total)}</td>
                <td style={cell} colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}

function SalaryRow({ person, salary, month, onSaved }) {
  const [form, setForm] = useState({
    baseSalary: salary?.baseSalary ?? person.baseSalary ?? "",
    bonus: salary?.bonus ?? person.bonus ?? "",
    deduction: salary?.deduction ?? "",
    paidOn: salary?.paidOn ?? iraqToday(),
    paymentMethod: salary?.paymentMethod ?? "CASH",
    notes: salary?.notes ?? ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const border = (field) => (error?.field === field ? { borderColor: "#dc2626" } : undefined);
  const amount = (value) => parseAmount(value) ?? 0;
  const net = netSalary({ baseSalary: amount(form.baseSalary), bonus: amount(form.bonus), deduction: amount(form.deduction) });

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await send("/api/salaries", "PUT", { staffId: person.id, month, ...form });
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
  const amountInput = (field) => input(field, { dir: "ltr", inputMode: "numeric", style: { width: "110px" } });

  return (
    <tr style={{ backgroundColor: salary ? "#f0fdf4" : undefined, opacity: person.isActive ? 1 : 0.6 }}>
      <td style={cell}>
        <strong>{person.name}</strong>
        <div style={{ fontSize: "12px", color: "#64748b" }}>
          {[person.job, SHIFTS[person.shift]].filter(Boolean).join(" — ")}
        </div>
        {error && <div role="alert" style={{ color: "#dc2626", fontSize: "12px", whiteSpace: "normal" }}>{error.message}</div>}
      </td>
      <td style={money}>{amountInput("baseSalary")}</td>
      <td style={money}>{amountInput("bonus")}</td>
      <td style={money}>{amountInput("deduction")}</td>
      <td style={{ ...money, fontWeight: 600 }}>{formatMoney(net)}</td>
      <td style={cell}>{input("paidOn", { type: "date" })}</td>
      <td style={cell}>
        <select form={`salary-${person.id}`} value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} style={small}>
          {Object.entries(PAYMENT_METHODS).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select>
      </td>
      <td style={cell}>{input("notes", { maxLength: 500, style: { width: "160px" } })}</td>
      <td style={cell}>
        <form id={`salary-${person.id}`} onSubmit={save} style={{ display: "inline" }}>
          <button type="submit" disabled={busy}>{salary ? "تحديث" : "تسجيل"}</button>
        </form>
        {salary && (
          <button type="button" disabled={busy} onClick={remove} style={{ color: "#b91c1c", marginInlineStart: "4px" }}>
            حذف
          </button>
        )}
      </td>
    </tr>
  );
}
