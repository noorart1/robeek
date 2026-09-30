
"use client";

import { useEffect, useState } from "react";
import { control, send } from "./StaffManager";
import { formatDate } from "../lib/arabic";
import { iraqToday } from "../lib/dates";
import { PAYMENT_METHODS, formatMoney } from "../lib/labels";
import { EXPENSE_CATEGORIES, EXPENSE_ITEMS, PARTNERS } from "../lib/finance";

// A partner's draw must name them to count in حصص الشركاء.
const ITEMS = [...EXPENSE_ITEMS, ...PARTNERS.map((p) => `سحب ${p.name}`), "تسليم الإدارة"];

const cell = { padding: "7px 8px", borderBottom: "1px solid #e2e8f0", textAlign: "right", whiteSpace: "nowrap" };
const money = { ...cell, textAlign: "left", fontVariantNumeric: "tabular-nums" };

const blank = (month) => ({
  date: iraqToday().startsWith(month) ? iraqToday() : `${month}-01`,
  item: "",
  category: "GENERAL",
  amount: "",
  paymentMethod: "CASH",
  notes: ""
});

// المصاريف of one month: added, corrected or removed here.
export default function ExpensesBoard() {
  const [month, setMonth] = useState(() => iraqToday().slice(0, 7));
  const [expenses, setExpenses] = useState(null);
  const [form, setForm] = useState(() => blank(iraqToday().slice(0, 7)));
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    try {
      setExpenses((await send(`/api/expenses?month=${month}`, "GET")).expenses);
    } catch (err) {
      setError({ message: err.message });
    }
  }

  useEffect(() => {
    setExpenses(null);
    reset();
    load();
  }, [month]);

  function reset() {
    setForm(blank(month));
    setEditingId(null);
    setError(null);
  }

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const border = (field) => (error?.field === field ? { borderColor: "#dc2626" } : undefined);

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await send(editingId ? `/api/expenses/${editingId}` : "/api/expenses", editingId ? "PATCH" : "POST", form);
      reset();
      await load();
    } catch (err) {
      setError({ message: err.message, field: err.field });
    } finally {
      setBusy(false);
    }
  }

  async function remove(expense) {
    if (!window.confirm(`حذف «${expense.item}» بمبلغ ${formatMoney(expense.amount)} د.ع؟`)) return;
    try {
      await send(`/api/expenses/${expense.id}`, "DELETE");
      if (editingId === expense.id) reset();
      await load();
    } catch (err) {
      setError({ message: err.message });
    }
  }

  function edit(expense) {
    setEditingId(expense.id);
    setForm({ ...expense, paymentMethod: expense.paymentMethod ?? "", notes: expense.notes ?? "" });
    setError(null);
  }

  const editingCategory = expenses?.find((e) => e.id === editingId)?.category;
  const sum = (category) =>
    (expenses ?? []).filter((e) => !category || e.category === category).reduce((t, e) => t + e.amount, 0);

  return (
    <>
      <label style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
        الشهر
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={control} />
      </label>

      <form
        onSubmit={save}
        onKeyDown={(e) => { if (e.key === "Escape" && editingId) { e.preventDefault(); reset(); } }}
        style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", padding: "12px", backgroundColor: "#ffffff", borderRadius: "12px", marginBottom: "12px" }}
      >
        <strong style={{ color: "#1e40af", width: "100%" }}>{editingId ? "تعديل مصروف" : "مصروف جديد"}</strong>
        <datalist id="expense-items">{ITEMS.map((i) => <option key={i} value={i} />)}</datalist>
        <input type="date" aria-label="التاريخ" required value={form.date} onChange={(e) => set("date", e.target.value)} style={{ ...control, ...border("date") }} />
        <input aria-label="بند المصروف" placeholder="بند المصروف" list="expense-items" required maxLength={191} value={form.item} onChange={(e) => set("item", e.target.value)} style={{ ...control, ...border("item"), width: "150px" }} />
        <select aria-label="النوع" value={form.category} onChange={(e) => set("category", e.target.value)} style={control}>
          {/* رواتب (مجموع) only for the old lump sums: salaries are paid under الرواتب. */}
          {Object.entries(EXPENSE_CATEGORIES)
            .filter(([v]) => v !== "SALARY" || editingCategory === "SALARY")
            .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input aria-label="المبلغ" placeholder="المبلغ" dir="ltr" inputMode="numeric" required value={form.amount} onChange={(e) => set("amount", e.target.value)} style={{ ...control, ...border("amount"), width: "120px" }} />
        <select aria-label="نوع الدفع" value={form.paymentMethod} onChange={(e) => set("paymentMethod", e.target.value)} style={control}>
          <option value="">—</option>
          {Object.entries(PAYMENT_METHODS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input aria-label="ملاحظات" placeholder="ملاحظات" maxLength={5000} value={form.notes} onChange={(e) => set("notes", e.target.value)} style={{ ...control, flex: "1 1 200px" }} />
        <button type="submit" disabled={busy}>{busy ? "جارٍ الحفظ..." : editingId ? "حفظ" : "+ إضافة"}</button>
        {editingId && <button type="button" onClick={reset}>إلغاء</button>}
        {error && <p role="alert" style={{ color: "#dc2626", margin: 0, width: "100%" }}>{error.message}</p>}
      </form>

      {expenses && (
        <div style={{ backgroundColor: "#ffffff", borderRadius: "12px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#eff6ff", color: "#1e40af" }}>
                <th style={cell}>التاريخ</th>
                <th style={cell}>بند المصروف</th>
                <th style={cell}>النوع</th>
                <th style={cell}>نوع الدفع</th>
                <th style={money}>المبلغ</th>
                <th style={cell}>ملاحظات</th>
                <th style={cell} />
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} style={{ backgroundColor: editingId === e.id ? "#fef9c3" : undefined }}>
                  <td style={cell}>{formatDate(e.date)}</td>
                  <td style={cell}>{e.item}</td>
                  <td style={cell}>{EXPENSE_CATEGORIES[e.category]}</td>
                  <td style={cell}>{PAYMENT_METHODS[e.paymentMethod] || "—"}</td>
                  <td style={money}>{formatMoney(e.amount)}</td>
                  <td style={{ ...cell, maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis" }} title={e.notes || undefined}>{e.notes}</td>
                  <td style={cell}>
                    <button type="button" onClick={() => edit(e)}>✎ تعديل</button>{" "}
                    <button type="button" onClick={() => remove(e)} style={{ color: "#b91c1c" }}>حذف</button>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr><td colSpan={7} style={{ ...cell, color: "#64748b" }}>لا توجد مصاريف في هذا الشهر.</td></tr>
              )}
            </tbody>
            <tfoot>
              {Object.entries(EXPENSE_CATEGORIES).map(([category, label]) => (
                <tr key={category}>
                  <td style={cell} colSpan={4}>{label}</td>
                  <td style={money}>{formatMoney(sum(category))}</td>
                  <td style={cell} colSpan={2} />
                </tr>
              ))}
              <tr style={{ fontWeight: "bold", backgroundColor: "#f8fafc" }}>
                <td style={cell} colSpan={4}>المجموع</td>
                <td style={money}>{formatMoney(sum())}</td>
                <td style={cell} colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
