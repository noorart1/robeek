
"use client";

import { useEffect, useState } from "react";
import { redirectIfSignedOut, SESSION_EXPIRED } from "./session";
import { SHIFTS, classLabel } from "../lib/labels";

const ROLE_LABELS = { ADMIN: "مدير", TEACHER: "مرشدة" };

// 14 characters without look-alikes (0/O, 1/l/I), so it can be read out
// or written down for a teacher without mistakes.
function generatePassword() {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function send(url, method, body) {
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

const control = {
  padding: "8px 10px",
  border: "1px solid #cbd5e1",
  borderRadius: "6px",
  backgroundColor: "#ffffff",
  boxSizing: "border-box"
};

export default function UsersManager() {
  const [users, setUsers] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [classes, setClasses] = useState([]);
  const [editing, setEditing] = useState(null); // null | "new" | user id
  const [error, setError] = useState("");

  async function load() {
    try {
      const [list, options] = await Promise.all([
        send("/api/users", "GET"),
        send("/api/options", "GET")
      ]);
      setUsers(list.users);
      setCurrentUserId(list.currentUserId);
      setClasses(options.classes);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const cell = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "right", verticalAlign: "top" };

  return (
    <main style={{ maxWidth: "1000px", margin: "24px auto", padding: "0 20px" }}>
      <h1 style={{ color: "#1e40af", marginBottom: "4px" }}>المستخدمون</h1>
      <p style={{ color: "#64748b", marginTop: 0 }}>
        المرشدة ترى صفحة الحضور فقط، ولشعبها فقط. المدير يرى كل شيء.
      </p>

      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}

      {editing === "new" ? (
        <UserForm
          classes={classes}
          users={users}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing("new")}
          style={{ padding: "9px 18px", backgroundColor: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", marginBottom: "14px" }}
        >
          + مستخدم جديد
        </button>
      )}

      <div style={{ backgroundColor: "#ffffff", borderRadius: "12px", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#eff6ff", color: "#1e40af" }}>
              {["الاسم", "اسم المستخدم", "الصلاحية", "الشعب", "الحالة", ""].map((h) => (
                <th key={h} style={cell}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((user) =>
              editing === user.id ? (
                <tr key={user.id}>
                  <td colSpan={6} style={{ ...cell, backgroundColor: "#f8fafc" }}>
                    <UserForm
                      user={user}
                      self={user.id === currentUserId}
                      classes={classes}
                      users={users}
                      onCancel={() => setEditing(null)}
                      onSaved={() => { setEditing(null); load(); }}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={user.id} style={{ opacity: user.isActive ? 1 : 0.55 }}>
                  <td style={{ ...cell, fontWeight: 600 }}>
                    {user.fullName}
                    {user.id === currentUserId && <small style={{ color: "#64748b" }}> (أنت)</small>}
                  </td>
                  <td style={cell} dir="ltr">{user.username}</td>
                  <td style={cell}>{ROLE_LABELS[user.role] || user.role}</td>
                  <td style={cell}>
                    {user.role === "TEACHER"
                      ? user.classes.length
                        ? user.classes.map(classLabel).join("، ")
                        : <span style={{ color: "#b45309" }}>لا توجد شعبة</span>
                      : "كل الشعب"}
                  </td>
                  <td style={cell}>{user.isActive ? "نشط" : "موقوف"}</td>
                  <td style={cell}>
                    <button type="button" onClick={() => setEditing(user.id)}>✎ تعديل</button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

// Create (no `user`) or edit an account.
function UserForm({ user, self = false, classes, users, onCancel, onSaved }) {
  const isNew = !user;

  const [form, setForm] = useState({
    fullName: user?.fullName ?? "",
    username: user?.username ?? "",
    role: user?.role ?? "TEACHER",
    isActive: user?.isActive ?? true,
    classIds: user?.classes.map((c) => c.id) ?? [],
    password: ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [shownPassword, setShownPassword] = useState("");

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const toggleClass = (id) =>
    set("classIds", form.classIds.includes(id) ? form.classIds.filter((c) => c !== id) : [...form.classIds, id]);

  async function submit(event) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      if (isNew) {
        await send("/api/users", "POST", {
          fullName: form.fullName,
          username: form.username,
          password: form.password,
          role: form.role,
          classIds: form.role === "TEACHER" ? form.classIds : []
        });
      } else {
        const changes = { fullName: form.fullName, role: form.role, isActive: form.isActive };
        if (form.role === "TEACHER") changes.classIds = form.classIds;
        if (form.password) changes.password = form.password;
        await send(`/api/users/${user.id}`, "PATCH", changes);
      }

      onSaved();
    } catch (err) {
      setError({ message: err.message, field: err.field });
    } finally {
      setBusy(false);
    }
  }

  const border = (field) => (error?.field === field ? { borderColor: "#dc2626" } : undefined);
  const label = { display: "grid", gap: "4px", fontSize: "13px", color: "#475569" };
  const teacherOf = (cls) =>
    cls.teacherUserId && cls.teacherUserId !== user?.id
      ? users.find((u) => u.id === cls.teacherUserId)?.fullName
      : null;

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onCancel(); } }}
      style={{ display: "grid", gap: "12px", padding: "14px", backgroundColor: "#ffffff", borderRadius: "12px", marginBottom: "14px" }}
    >
      <strong style={{ color: "#1e40af" }}>{isNew ? "مستخدم جديد" : `تعديل: ${user.fullName}`}</strong>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "10px" }}>
        <label style={label}>
          الاسم الكامل
          <input required autoFocus maxLength={100} value={form.fullName} onChange={(e) => set("fullName", e.target.value)} style={{ ...control, ...border("fullName") }} />
        </label>

        <label style={label}>
          اسم المستخدم {isNew ? "(أحرف إنجليزية)" : ""}
          <input
            dir="ltr"
            required={isNew}
            disabled={!isNew}
            maxLength={50}
            autoComplete="off"
            value={form.username}
            onChange={(e) => set("username", e.target.value)}
            style={{ ...control, ...border("username") }}
          />
        </label>

        <label style={label}>
          الصلاحية
          <select value={form.role} disabled={self} onChange={(e) => set("role", e.target.value)} style={{ ...control, ...border("role") }}>
            <option value="TEACHER">مرشدة — الحضور لشعبها فقط</option>
            <option value="ADMIN">مدير — كل الصلاحيات</option>
          </select>
        </label>

        <label style={label}>
          {isNew ? "كلمة المرور" : "كلمة مرور جديدة (اتركها فارغة للإبقاء)"}
          <span style={{ display: "flex", gap: "4px" }}>
            <input
              dir="ltr"
              type="text"
              autoComplete="new-password"
              required={isNew}
              disabled={self}
              placeholder={self ? "من صفحة «حسابي»" : ""}
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              style={{ ...control, ...border("password"), flex: 1, minWidth: 0, fontFamily: "monospace" }}
            />
            {!self && (
              <button
                type="button"
                onClick={() => { const p = generatePassword(); set("password", p); setShownPassword(p); }}
              >
                توليد
              </button>
            )}
          </span>
        </label>
      </div>

      {shownPassword && form.password === shownPassword && (
        <small style={{ color: "#15803d" }}>
          انسخ كلمة المرور وسلّمها للمستخدم قبل الحفظ؛ لن تظهر مرة أخرى. يستطيع تغييرها من «حسابي».
        </small>
      )}

      {form.role === "TEACHER" && (
        <fieldset style={{ border: `1px solid ${error?.field === "classIds" ? "#dc2626" : "#e2e8f0"}`, borderRadius: "8px", padding: "10px" }}>
          <legend style={{ color: "#475569", fontSize: "13px" }}>الشعب التي تسجّل حضورها</legend>
          {Object.entries(SHIFTS).map(([shift, shiftLabel]) => (
            <div key={shift} style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginBottom: "6px" }}>
              <strong style={{ width: "50px", color: "#64748b" }}>{shiftLabel}</strong>
              {classes.filter((c) => c.shift === shift).map((cls) => (
                <label key={cls.id} style={{ display: "flex", gap: "4px", alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={form.classIds.includes(cls.id)} onChange={() => toggleClass(cls.id)} />
                  {cls.name}
                  {teacherOf(cls) && <small style={{ color: "#b45309" }}>(حالياً: {teacherOf(cls)})</small>}
                </label>
              ))}
            </div>
          ))}
        </fieldset>
      )}

      {!isNew && !self && (
        <label style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
          الحساب نشط (إلغاء التحديد يوقف الحساب ويسجّل خروجه من كل الأجهزة)
        </label>
      )}

      {error && <p role="alert" style={{ color: "#dc2626", margin: 0 }}>{error.message}</p>}

      <div style={{ display: "flex", gap: "8px" }}>
        <button type="submit" disabled={busy} style={{ padding: "9px 22px", backgroundColor: "#2563eb", color: "#fff", border: "none", borderRadius: "8px" }}>
          {busy ? "جارٍ الحفظ..." : isNew ? "إنشاء الحساب" : "حفظ"}
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>إلغاء</button>
      </div>
    </form>
  );
}
