
"use client";

import { useEffect, useState } from "react";
import { control, send } from "./StaffManager";
import { useUrlMonth } from "./url-month";
import { formatDate } from "../lib/arabic";
import { iraqToday } from "../lib/dates";
import { PAYMENT_METHODS, formatMoney } from "../lib/labels";
import { EXPENSE_CATEGORIES, EXPENSE_ITEMS, PARTNERS } from "../lib/finance";

// One ledger board per finance tab, each with only its own categories:
// the two expense tabs look alike and need no category picker; the box
// tab holds the money moving in and out of الصندوق. A partner's draw must
// name them («سحب البراق») to count in حصص الشركاء.
const BOARDS = {
  GENERAL: { categories: ["GENERAL"], items: ["الكهرباء", "ماء", "انترنت", ...EXPENSE_ITEMS], noun: "مصروف", empty: "لا توجد مصاريف عامة في هذا الشهر." },
  ASSET: { categories: ["ASSET"], items: ["رسوم ادارية", "العاب وديكور", "تطوير", "اجهزة"], noun: "مصروف ثابت", empty: "لا توجد مصاريف ثابتة في هذا الشهر." },
  // تسليم الإدارة is worked out from the receipts now: its old hand-entered
  // rows are listed (and editable) but no new ones are added.
  BOX: {
    categories: ["INCOME", "WITHDRAWAL", "HANDOVER"],
    legacy: ["HANDOVER"],
    items: ["مبيعات المركز", ...PARTNERS.map((p) => `سحب ${p.name}`)],
    noun: "حركة",
    empty: "لا توجد حركات في هذا الشهر."
  }
};

const cell = { padding: "7px 8px", borderBottom: "1px solid #e2e8f0", textAlign: "right", whiteSpace: "nowrap" };
const money = { ...cell, textAlign: "left", fontVariantNumeric: "tabular-nums" };

const blank = (month, category) => ({
  date: iraqToday().startsWith(month) ? iraqToday() : `${month}-01`,
  item: "",
  category,
  amount: "",
  paymentMethod: "CASH",
  notes: ""
});

// kind GENERAL, ASSET or BOX: that ledger for one month, added to,
// corrected or removed here.
export default function ExpensesBoard({ kind = "GENERAL" }) {
  const board = BOARDS[kind];
  const [month, setMonth] = useUrlMonth();
  const [expenses, setExpenses] = useState(null);
  const [form, setForm] = useState(() => blank(month, board.categories[0]));
  const [editingId, setEditingId] = useState(null);
  // البند: chosen from the board's list, or typed by hand («أخرى»). A
  // datalist hid every item but the one already typed.
  const [customItem, setCustomItem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    try {
      const all = (await send(`/api/expenses?month=${month}`, "GET")).expenses;
      setExpenses(all.filter((e) => board.categories.includes(e.category)));
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
    setForm(blank(month, board.categories[0]));
    setCustomItem(false);
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
    setCustomItem(!board.items.includes(expense.item));
    setError(null);
  }

  const picker = board.categories.length > 1;
  const editingCategory = expenses?.find((e) => e.id === editingId)?.category;
  const choices = board.categories.filter((c) => !board.legacy?.includes(c) || c === editingCategory);
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
        <strong style={{ color: "#1e40af", width: "100%" }}>{editingId ? `تعديل ${board.noun}` : `${board.noun} جديد${kind === "BOX" ? "ة" : ""}`}</strong>
        <input type="date" aria-label="التاريخ" required value={form.date} onChange={(e) => set("date", e.target.value)} style={{ ...control, ...border("date") }} />
        {customItem ? (
          <span style={{ display: "inline-flex", gap: "4px" }}>
            <input aria-label="البند" placeholder="اكتب البند" autoFocus required maxLength={191} value={form.item} onChange={(e) => set("item", e.target.value)} style={{ ...control, ...border("item"), width: "150px" }} />
            <button type="button" title="الاختيار من القائمة" onClick={() => { setCustomItem(false); set("item", ""); }}>↩</button>
          </span>
        ) : (
          <select
            aria-label="البند"
            required
            value={form.item}
            onChange={(e) => (e.target.value === "__other" ? (setCustomItem(true), set("item", "")) : set("item", e.target.value))}
            style={{ ...control, ...border("item") }}
          >
            <option value="">{kind === "BOX" ? "— البند —" : "— بند المصروف —"}</option>
            {board.items.map((i) => <option key={i} value={i}>{i}</option>)}
            <option value="__other">أخرى (كتابة يدوية)…</option>
          </select>
        )}
        {picker && (
          <select aria-label="النوع" value={form.category} onChange={(e) => set("category", e.target.value)} style={control}>
            {choices.map((v) => <option key={v} value={v}>{EXPENSE_CATEGORIES[v]}</option>)}
          </select>
        )}
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
                <th style={cell}>{kind === "BOX" ? "البند" : "بند المصروف"}</th>
                {picker && <th style={cell}>النوع</th>}
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
                  {picker && <td style={cell}>{EXPENSE_CATEGORIES[e.category]}</td>}
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
                <tr><td colSpan={picker ? 7 : 6} style={{ ...cell, color: "#64748b" }}>{board.empty}</td></tr>
              )}
            </tbody>
            <tfoot>
              {/* Per category only where the tab has several (they are not one sum). */}
              {picker ? board.categories.map((category) => (
                <tr key={category} style={{ fontWeight: "bold", backgroundColor: "#f8fafc" }}>
                  <td style={cell} colSpan={4}>
                    {EXPENSE_CATEGORIES[category]}
                    {board.legacy?.includes(category) && <small style={{ fontWeight: "normal", color: "#64748b" }}> (المسجل يدوياً سابقاً)</small>}
                  </td>
                  <td style={money}>{formatMoney(sum(category))}</td>
                  <td style={cell} colSpan={2} />
                </tr>
              )) : (
                <tr style={{ fontWeight: "bold", backgroundColor: "#f8fafc" }}>
                  <td style={cell} colSpan={3}>المجموع</td>
                  <td style={money}>{formatMoney(sum())}</td>
                  <td style={cell} colSpan={2} />
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
