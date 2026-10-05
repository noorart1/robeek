
"use client";

import { useEffect, useState } from "react";
import { StaffDialog, control, send } from "./StaffManager";
import { useUrlMonth } from "./url-month";
import { formatDate } from "../lib/arabic";
import { SHIFTS, formatMoney } from "../lib/labels";
import { JOB_SUGGESTIONS } from "../lib/staff";

// Compact, so the whole month fits the page without scrolling sideways.
// Money columns take only the width they need (width 1%), so the spare
// width goes to ملاحظات instead of spreading the numbers apart.
const cell = { padding: "8px 10px", borderBottom: "1px solid #e2e8f0", textAlign: "right", whiteSpace: "nowrap" };
const money = { ...cell, textAlign: "left", fontVariantNumeric: "tabular-nums", width: "1%" };
// 0 as «—», so the figures that matter stand out.
const amount = (value) => (value ? formatMoney(value) : "—");

// الرواتب: one row per person for the chosen month — what they are due
// (the person's usual salary until set otherwise), what was paid and what
// is left, read-only. Payments (راتب، دفعة، مكافأة), receipts
// and voiding are in the person's window (click the name).
// readOnly: listed only (a معاون who may see the tab but not change it).
// staffEditable: the person's details can be edited in their window
// (admins: الكادر is theirs).
export default function SalariesBoard({ defaultMonth, readOnly = false, staffEditable = true }) {
  const [month, setMonth] = useUrlMonth(defaultMonth);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null); // staff id shown in the dialog

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
    // Staff are edited on «الكادر», often in another tab: refetch on return.
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [month]);

  const salaryOf = (id) => data?.salaries.find((s) => s.staffId === id);
  const salaries = data?.salaries ?? [];
  // Totals cover everyone listed, as their rows show them.
  const rows = (data?.staff ?? []).map((person) => figures(person, salaryOf(person.id)));
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
                <th style={{ ...cell, width: "1%" }}>الاسم</th>
                <th style={money}>الراتب</th>
                <th style={money}>المكافأة</th>
                <th style={money}>الخصومات / الدفعات</th>
                <th style={money}>الصافي</th>
                <th style={money}>المدفوع</th>
                <th style={money}>الباقي</th>
                <th style={{ ...cell, minWidth: "220px" }}>ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {data.staff.map((person) => {
                return (
                  <SalaryRow
                    key={person.id}
                    person={person}
                    salary={salaryOf(person.id)}
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
                <td style={cell}>
                  المجموع (مدفوع بالكامل: {salaries.filter((s) => s.remaining <= 0).length} من {data.staff.length})
                </td>
                <td style={money}>{formatMoney(sum("base"))}</td>
                <td style={{ ...money, color: "#15803d" }}>{formatMoney(sum("bonus"))}</td>
                <td style={{ ...money, color: "#b91c1c" }}>{formatMoney(sum("deductions"))}</td>
                <td style={money}>{formatMoney(sum("net"))}</td>
                <td style={{ ...money, color: "#15803d" }}>{formatMoney(sum("paid"))}</td>
                <td style={{ ...money, color: sum("remaining") > 0 ? "#b91c1c" : undefined }}>{formatMoney(sum("remaining"))}</td>
                <td style={cell} />
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
          readOnly={readOnly}
          staffEditable={staffEditable}
        />
      )}
    </>
  );
}

// What a row shows. الصافي = الراتب + المكافأة − الخصومات / الدفعات, and
// المدفوع counts bonuses but not advances (they are under الخصومات), so
// الباقي is the month's own remaining. A month not saved yet is due the
// person's usual salary.
function figures(person, salary) {
  if (!salary) {
    const due = person.baseSalary ?? 0;
    return { base: due, bonus: 0, deductions: 0, net: due, paid: 0, remaining: due };
  }
  const bonus = (salary.bonus ?? 0) + salary.bonuses;
  const deductions = (salary.deduction ?? 0) + salary.advances;
  return {
    base: salary.baseSalary,
    bonus,
    deductions,
    net: salary.baseSalary + bonus - deductions,
    paid: salary.paid - salary.advances + salary.bonuses,
    remaining: salary.remaining
  };
}

// Read-only: pay, bonuses and دفعات are recorded as payments
// in the person's window (click the name); the first one saves the month.
function SalaryRow({ person, salary, onOpen }) {
  const f = figures(person, salary);

  const background = salary && f.remaining <= 0 ? "#f0fdf4" : f.paid > 0 ? "#fffbeb" : undefined;

  return (
    <tr style={{ backgroundColor: background, opacity: person.isActive ? 1 : 0.6 }}>
      <td style={cell}>
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
      </td>
      <td style={money}>{formatMoney(f.base)}</td>
      <td style={{ ...money, color: f.bonus ? "#15803d" : "#94a3b8" }}>{amount(f.bonus)}</td>
      <td style={{ ...money, color: f.deductions ? "#b91c1c" : "#94a3b8" }}>{amount(f.deductions)}</td>
      <td style={{ ...money, fontWeight: 600 }}>{formatMoney(f.net)}</td>
      <td style={{ ...money, color: f.paid ? "#15803d" : "#94a3b8" }}>{amount(f.paid)}</td>
      <td style={{ ...money, fontWeight: 600, color: f.remaining > 0 ? "#b91c1c" : "#94a3b8" }}>{amount(f.remaining)}</td>
      <td style={{ ...cell, whiteSpace: "normal", color: "#475569", fontSize: "14px" }}>{salary?.allNotes.join(" · ")}</td>
    </tr>
  );
}
