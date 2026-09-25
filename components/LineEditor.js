
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { redirectIfSignedOut, SESSION_EXPIRED } from "./session";
import { SHIFTS } from "../lib/labels";

async function send(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  if (redirectIfSignedOut(response)) throw new Error(SESSION_EXPIRED);

  const data = await response.json();

  if (!response.ok) {
    throw Object.assign(new Error(data.error || "تعذر الحفظ."), { field: data.field });
  }

  return data;
}

const control = {
  padding: "7px 9px",
  border: "1px solid #cbd5e1",
  borderRadius: "6px",
  backgroundColor: "#ffffff"
};

// Name, phone and shift inputs shared by the edit and add forms.
// Enter submits (it is a form); Escape cancels.
function LineFields({ form, setForm, error, onCancel, autoFocus }) {
  const escape = (event) => {
    if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      onCancel();
    }
  };

  const border = (field) =>
    error?.field === field ? { borderColor: "#dc2626" } : undefined;

  return (
    <>
      <input
        aria-label="اسم السائق"
        placeholder="اسم السائق"
        required
        maxLength={100}
        autoFocus={autoFocus}
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        onKeyDown={escape}
        style={{ ...control, ...border("name"), width: "150px" }}
      />
      <input
        aria-label="هاتف السائق"
        placeholder="07XXXXXXXXX"
        dir="ltr"
        inputMode="tel"
        maxLength={30}
        value={form.driverPhone}
        onChange={(e) => setForm((f) => ({ ...f, driverPhone: e.target.value }))}
        onKeyDown={escape}
        style={{ ...control, ...border("driverPhone"), width: "140px" }}
      />
      <select
        aria-label="الفترة"
        value={form.shift}
        onChange={(e) => setForm((f) => ({ ...f, shift: e.target.value }))}
        onKeyDown={escape}
        style={control}
      >
        {Object.entries(SHIFTS).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    </>
  );
}

export function LineHeader({ line, riders }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function startEditing() {
    setForm({ name: line.name, driverPhone: line.driverPhone || "", shift: line.shift });
    setError(null);
    setEditing(true);
  }

  async function save(event) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      await send(`/api/transport-lines/${line.id}`, "PATCH", form);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError({ message: err.message, field: err.field });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const message = riders
      ? `حذف خط ${line.name}؟ سيبقى ${riders} أطفال مسجلين لكن بدون خط نقل.`
      : `حذف خط ${line.name}؟`;

    if (!window.confirm(message)) return;

    setBusy(true);
    setError(null);

    try {
      await send(`/api/transport-lines/${line.id}`, "DELETE");
      router.refresh();
    } catch (err) {
      setError({ message: err.message });
      setBusy(false);
    }
  }

  const bar = {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
    padding: "10px 14px",
    borderBottom: "2px solid #eff6ff"
  };

  if (editing) {
    return (
      <form onSubmit={save} style={bar}>
        <strong style={{ color: "#1e40af" }}>خط</strong>
        <LineFields
          form={form}
          setForm={setForm}
          error={error}
          onCancel={() => setEditing(false)}
          autoFocus
        />
        <button type="submit" disabled={busy}>{busy ? "جارٍ الحفظ..." : "حفظ"}</button>
        <button type="button" disabled={busy} onClick={() => setEditing(false)}>إلغاء</button>
        {error && <small role="alert" style={{ color: "#dc2626", width: "100%" }}>{error.message}</small>}
      </form>
    );
  }

  return (
    <div style={bar}>
      <strong style={{ fontSize: "17px", color: "#1e40af" }}>خط {line.name}</strong>
      {line.driverPhone && <span dir="ltr" style={{ color: "#475569" }}>{line.driverPhone}</span>}
      <span style={{ color: "#64748b" }}>
        {SHIFTS[line.shift]} — {riders} أطفال
      </span>
      <span style={{ marginInlineStart: "auto", display: "flex", gap: "6px" }}>
        <button type="button" onClick={startEditing} disabled={busy}>✎ تعديل</button>
        <button type="button" onClick={remove} disabled={busy} style={{ color: "#b91c1c" }}>حذف</button>
      </span>
      {error && <small role="alert" style={{ color: "#dc2626", width: "100%" }}>{error.message}</small>}
    </div>
  );
}

const emptyLine = { name: "", driverPhone: "", shift: "MORNING" };

export function AddLine() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyLine);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function close() {
    setOpen(false);
    setForm(emptyLine);
    setError(null);
  }

  async function add(event) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      await send("/api/transport-lines", "POST", form);
      close();
      router.refresh();
    } catch (err) {
      setError({ message: err.message, field: err.field });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: "9px 18px",
          backgroundColor: "#2563eb",
          color: "#ffffff",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer"
        }}
      >
        + إضافة خط
      </button>
    );
  }

  return (
    <form
      onSubmit={add}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        flexWrap: "wrap",
        padding: "12px 14px",
        backgroundColor: "#ffffff",
        borderRadius: "12px"
      }}
    >
      <strong style={{ color: "#1e40af" }}>خط جديد:</strong>
      <LineFields form={form} setForm={setForm} error={error} onCancel={close} autoFocus />
      <button type="submit" disabled={busy}>{busy ? "جارٍ الحفظ..." : "إضافة"}</button>
      <button type="button" disabled={busy} onClick={close}>إلغاء</button>
      {error && <small role="alert" style={{ color: "#dc2626", width: "100%" }}>{error.message}</small>}
    </form>
  );
}
