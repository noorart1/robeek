
"use client";

import { useEffect, useState } from "react";
import { redirectIfSignedOut, SESSION_EXPIRED } from "./session";
import { SHIFTS, classLabel } from "../lib/labels";
import { ACCESS_LEVELS, FINANCE_TABS } from "../lib/finance-access";

const ROLE_LABELS = { ADMIN: "مدير", DEPUTY: "معاون", TEACHER: "مرشدة" };

// A معاون's tabs, one line: «الملخص (قراءة فقط)، رواتب الموظفين».
const accessSummary = (access) =>
  Object.entries(access)
    .map(([tab, level]) => `${FINANCE_TABS[tab]}${level === "READ" ? " (قراءة فقط)" : ""}`)
    .join("، ");

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
  const [staff, setStaff] = useState([]);
  const [editing, setEditing] = useState(null); // null | "new" | user id
  const [error, setError] = useState("");

  async function load() {
    try {
      const [list, options, people] = await Promise.all([
        send("/api/users", "GET"),
        send("/api/options", "GET"),
        send("/api/staff", "GET")
      ]);
      setUsers(list.users);
      setCurrentUserId(list.currentUserId);
      setClasses(options.classes);
      setStaff(people.staff);
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
        المرشدة ترى صفحة الحضور فقط، ولشعبها فقط. المعاون يرى من المالية ما يحدده له المدير فقط. المدير يرى كل شيء.
      </p>

      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}

      {editing === "new" ? (
        <UserForm
          classes={classes}
          staff={staff}
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
              {["الاسم", "اسم المستخدم", "الصلاحية", "الشعب / المالية", "الحالة", ""].map((h) => (
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
                      staff={staff}
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
                      : user.role === "DEPUTY"
                        ? accessSummary(user.financeAccess) || <span style={{ color: "#b45309" }}>لا يوجد قسم</span>
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
function UserForm({ user, self = false, classes, staff, users, onCancel, onSaved }) {
  const isNew = !user;

  const [form, setForm] = useState({
    fullName: user?.fullName ?? "",
    username: user?.username ?? "",
    role: user?.role ?? "TEACHER",
    isActive: user?.isActive ?? true,
    classIds: user?.classes.map((c) => c.id) ?? [],
    staffId: user?.staffId ? String(user.staffId) : "",
    financeAccess: user?.financeAccess ?? {},
    password: ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [shownPassword, setShownPassword] = useState("");

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  // Linked to الكادر: her name comes from there, and the sections chosen
  // for her on the dashboard are ticked.
  function linkStaff(value) {
    const person = staff.find((p) => String(p.id) === value);
    setForm((f) => ({
      ...f,
      staffId: value,
      fullName: person ? person.name : f.fullName,
      classIds: person
        ? [...new Set([...f.classIds, ...classes.filter((c) => c.staffId === person.id).map((c) => c.id)])]
        : f.classIds
    }));
  }

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
          staffId: form.staffId || null,
          classIds: form.role === "TEACHER" ? form.classIds : [],
          financeAccess: form.role === "DEPUTY" ? form.financeAccess : {}
        });
      } else {
        const changes = { fullName: form.fullName, role: form.role, isActive: form.isActive, staffId: form.staffId || null };
        if (form.role === "TEACHER") changes.classIds = form.classIds;
        if (form.role === "DEPUTY") changes.financeAccess = form.financeAccess;
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
          الموظف في «الكادر»
          <select value={form.staffId} onChange={(e) => linkStaff(e.target.value)} style={{ ...control, ...border("staffId") }}>
            <option value="">— غير مرتبط —</option>
            {staff
              .filter((p) => p.isActive || String(p.id) === form.staffId)
              .filter((p) => String(p.id) === form.staffId || !users.some((u) => u.staffId === p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.job ? ` (${p.job})` : ""}</option>
              ))}
          </select>
        </label>

        <label style={label}>
          الاسم الكامل {form.staffId ? "(من الكادر)" : ""}
          <input required autoFocus maxLength={100} disabled={!!form.staffId} value={form.fullName} onChange={(e) => set("fullName", e.target.value)} style={{ ...control, ...border("fullName") }} />
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
            <option value="DEPUTY">معاون — أقسام المالية المحددة فقط</option>
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

      {form.role === "DEPUTY" && (
        <fieldset style={{ border: `1px solid ${error?.field === "financeAccess" ? "#dc2626" : "#e2e8f0"}`, borderRadius: "8px", padding: "10px" }}>
          <legend style={{ color: "#475569", fontSize: "13px" }}>أقسام المالية التي يراها</legend>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "8px 16px" }}>
            {Object.entries(FINANCE_TABS).map(([tab, tabLabel]) => (
              <label key={tab} style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "space-between" }}>
                {tabLabel}
                <select
                  value={form.financeAccess[tab] ?? ""}
                  onChange={(e) => set("financeAccess", { ...form.financeAccess, [tab]: e.target.value || undefined })}
                  style={{ ...control, padding: "5px 8px" }}
                >
                  <option value="">لا يراه</option>
                  {Object.entries(ACCESS_LEVELS).map(([level, levelLabel]) => <option key={level} value={level}>{levelLabel}</option>)}
                </select>
              </label>
            ))}
          </div>
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
