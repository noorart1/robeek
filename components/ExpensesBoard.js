
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
  // تسليم الإدارة is worked out from the receipts now, and وارد آخر is no
  // longer entered: their old rows are listed (and editable) but no new
  // ones are added, so a new movement is always سحب الشركاء.
  BOX: {
    categories: ["WITHDRAWAL", "INCOME", "HANDOVER"],
    legacy: ["INCOME", "HANDOVER"],
    // A fixed list, nothing typed by hand (older rows keep their item).
    items: [...PARTNERS.map((p) => `سحب ${p.name}`), "تسليم ابوحسن"],
    fixedItems: true,
    // The list can be narrowed to one البند.
    itemFilter: true,
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
export default function ExpensesBoard({ kind = "GENERAL", defaultMonth }) {
  const board = BOARDS[kind];
  const [month, setMonth] = useUrlMonth(defaultMonth);
  const [expenses, setExpenses] = useState(null);
  const [form, setForm] = useState(() => blank(month, board.categories[0]));
  const [editingId, setEditingId] = useState(null);
  // البند: chosen from the board's list, or typed by hand («أخرى», not on
  // the box board; editing an older row with another item still can). A
  // datalist hid every item but the one already typed.
  const [customItem, setCustomItem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // البند filter: the items ticked; none ticked shows everything.
  const [itemFilter, setItemFilter] = useState([]);
  const [filterOpen, setFilterOpen] = useState(false);

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

  const editingCategory = expenses?.find((e) => e.id === editingId)?.category;
  const choices = board.categories.filter((c) => !board.legacy?.includes(c) || c === editingCategory);
  // The form picks among what can still be added; the list shows every kind.
  const picker = choices.length > 1;
  const kinds = board.categories.length > 1;
  // The list's items: the board's, then any older ones found this month.
  const listItems = [...new Set([...board.items, ...(expenses ?? []).map((e) => e.item)])];
  const shown = (expenses ?? []).filter((e) => !itemFilter.length || itemFilter.includes(e.item));
  const toggleItem = (item) =>
    setItemFilter((f) => (f.includes(item) ? f.filter((i) => i !== item) : [...f, item]));
  const sum = (category) =>
    shown.filter((e) => !category || e.category === category).reduce((t, e) => t + e.amount, 0);

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
            {!board.fixedItems && <option value="__other">أخرى (كتابة يدوية)…</option>}
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

      {itemFilter.length > 0 && (
        // The ticked items, each removable with ✕.
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center", marginBottom: "8px", color: "#475569" }}>
          تصفية البند:
          {itemFilter.map((i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 6px 3px 10px", borderRadius: "999px", backgroundColor: "#dbeafe", color: "#1e40af" }}>
              {i}
              <button type="button" aria-label={`إزالة ${i} من التصفية`} onClick={() => toggleItem(i)} style={{ border: "none", background: "none", color: "inherit", cursor: "pointer", padding: "0 2px" }}>✕</button>
            </span>
          ))}
          <button type="button" onClick={() => setItemFilter([])}>إظهار الكل</button>
        </div>
      )}

      {expenses && (
        <div style={{ backgroundColor: "#ffffff", borderRadius: "12px", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#eff6ff", color: "#1e40af" }}>
                <th style={cell}>التاريخ</th>
                <th style={{ ...cell, position: "relative" }}>
                  {kind === "BOX" ? "البند" : "بند المصروف"}
                  {board.itemFilter && (
                    // Closes on Escape or a click outside the icon and its list.
                    <span onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setFilterOpen(false)}>
                      <button
                        type="button"
                        title={itemFilter.length ? `تصفية: ${itemFilter.join("، ")}` : "تصفية حسب البند"}
                        aria-label="تصفية حسب البند"
                        aria-expanded={filterOpen}
                        onClick={() => setFilterOpen((o) => !o)}
                        style={{ marginInlineStart: "6px", padding: "2px 4px", border: "none", borderRadius: "4px", cursor: "pointer", verticalAlign: "middle", backgroundColor: itemFilter.length ? "#2563eb" : "transparent", color: itemFilter.length ? "#ffffff" : "#1e40af" }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <path d="M3 4h18l-7 8.5V19l-4 2v-8.5L3 4z" />
                        </svg>
                      </button>
                      {filterOpen && (
                        <div
                          role="group"
                          aria-label="البند"
                          tabIndex={-1}
                          ref={(el) => el && !el.contains(document.activeElement) && el.focus()}
                          onKeyDown={(e) => e.key === "Escape" && setFilterOpen(false)}
                          style={{ position: "absolute", top: "100%", insetInlineStart: 0, zIndex: 5, minWidth: "190px", padding: "8px 10px", backgroundColor: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "8px", boxShadow: "0 4px 12px rgba(15, 23, 42, 0.12)", fontWeight: "normal", color: "#1e293b", outline: "none" }}
                        >
                          {listItems.map((i) => (
                            <label key={i} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "3px 0" }}>
                              <input type="checkbox" checked={itemFilter.includes(i)} onChange={() => toggleItem(i)} />
                              {i}
                            </label>
                          ))}
                          <button type="button" disabled={!itemFilter.length} onClick={() => setItemFilter([])} style={{ marginTop: "6px" }}>
                            إظهار الكل
                          </button>
                        </div>
                      )}
                    </span>
                  )}
                </th>
                {kinds && <th style={cell}>النوع</th>}
                <th style={cell}>نوع الدفع</th>
                <th style={money}>المبلغ</th>
                <th style={cell}>ملاحظات</th>
                <th style={cell} />
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id} style={{ backgroundColor: editingId === e.id ? "#fef9c3" : undefined }}>
                  <td style={cell}>{formatDate(e.date)}</td>
                  <td style={cell}>{e.item}</td>
                  {kinds && <td style={cell}>{EXPENSE_CATEGORIES[e.category]}</td>}
                  <td style={cell}>{PAYMENT_METHODS[e.paymentMethod] || "—"}</td>
                  <td style={money}>{formatMoney(e.amount)}</td>
                  <td style={{ ...cell, maxWidth: "280px", overflow: "hidden", textOverflow: "ellipsis" }} title={e.notes || undefined}>{e.notes}</td>
                  <td style={cell}>
                    <button type="button" onClick={() => edit(e)}>✎ تعديل</button>{" "}
                    <button type="button" onClick={() => remove(e)} style={{ color: "#b91c1c" }}>حذف</button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={kinds ? 7 : 6} style={{ ...cell, color: "#64748b" }}>{board.empty}</td></tr>
              )}
            </tbody>
            <tfoot>
              {/* Per category only where the tab has several (they are not one sum). */}
              {kinds ? board.categories.map((category) => (
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
