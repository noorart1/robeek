
"use client";

import { useState } from "react";
import { redirectIfSignedOut, SESSION_EXPIRED } from "./session";
import { formatDate } from "../lib/arabic";

const options = {
  gender: [
    { value: "", label: "غير محدد" },
    { value: "MALE", label: "ذكر" },
    { value: "FEMALE", label: "أنثى" }
  ],
  status: [
    { value: "ACTIVE", label: "نشط" },
    { value: "INACTIVE", label: "غير نشط" }
  ]
};

const DEFAULT_WIDTH = 160;

const widths = {
  address: 220,
  notes: 220
};

const limits = {
  studentCode: 50,
  firstName: 100,
  lastName: 100,
  fatherName: 100,
  grandfatherName: 100,
  birthYear: 4,
  nationalId: 30,
  phone: 30,
  phone2: 30,
  emergencyPhone: 30,
  address: 500,
  notes: 500
};

function normalize(value, type) {
  if (type === "date") {
    return value ? String(value).slice(0, 10) : "";
  }

  return value ?? "";
}

function display(value, type) {
  if (type === "gender") {
    return value === "MALE"
      ? "ذكر"
      : value === "FEMALE"
        ? "أنثى"
        : "—";
  }

  if (type === "status") {
    return value === "ACTIVE" ? "نشط" : "غير نشط";
  }

  if (type === "date") {
    return formatDate(value) || "—";
  }

  return value || "—";
}

export default function EditableCell({
  studentId,
  parentId,
  field,
  value,
  type = "text",
  updatedAt,
  onSaved,
  onEditingChange
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(
    normalize(value, type)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [editVersion, setEditVersion] = useState(null);

  function startEditing() {
    setDraft(normalize(value, type));
    setEditVersion(updatedAt);
    setError("");
    setConflict(false);
    setEditing(true);
    onEditingChange?.(true);
  }

  function cancelEditing() {
    if (saving) return;

    setDraft(normalize(value, type));
    setError("");
    setConflict(false);
    setEditing(false);
    onEditingChange?.(false);
  }

  async function save() {
    if (saving || conflict) return;

    if (draft === normalize(value, type)) {
      setEditing(false);
    onEditingChange?.(false);
      return;
    }

    if (!editVersion) {
      setError("يرجى تحديث الجدول قبل الحفظ.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        parentId ? `/api/parents/${parentId}` : `/api/students/${studentId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            field,
            value: draft,
            updatedAt: editVersion
          })
        }
      );

      if (redirectIfSignedOut(response)) {
        throw new Error(SESSION_EXPIRED);
      }

      const data = await response.json();

      if (
        response.status === 409 &&
        data.code === "EDIT_CONFLICT"
      ) {
        if (data.student || data.parent) {
          onSaved(data.student || data.parent);
        }

        setConflict(true);
        setError(
          "تم تعديل البيانات من مستخدم آخر. يرجى مراجعة القيمة الجديدة."
        );
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.error || "تعذر حفظ التغييرات."
        );
      }

      onSaved(data.student || data.parent);
      setEditing(false);
    onEditingChange?.(false);
      setError("");
      setConflict(false);
    } catch (err) {
      setError(
        err.message || "حدث خطأ في الاتصال بالخادم."
      );
    } finally {
      setSaving(false);
    }
  }

  // Enter saves and Escape cancels; in multi-line fields Shift+Enter
  // still inserts a new line.
  function handleKeyDown(event) {
    if (event.nativeEvent.isComposing) return;

    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      save();
    }
  }

  function refreshEditVersion() {
    setDraft(normalize(value, type));
    setEditVersion(updatedAt);
    setConflict(false);
    setError("");
  }

  if (!editing) {
    const shown = display(value, type);

    return (
      <button
        type="button"
        onClick={startEditing}
        title={shown === "—" ? undefined : shown}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "8px",
          textAlign: "right",
          width: "100%",
          minWidth: "110px",
          maxWidth: `${widths[field] || DEFAULT_WIDTH}px`,
          fontFamily: "inherit",
          fontSize: "inherit"
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textAlign: "right"
          }}
        >
          {shown}
        </span>
        <span style={{ flexShrink: 0, color: "#94a3b8" }}>✎</span>
      </button>
    );
  }

  const inputStyle = {
    width: "100%",
    padding: "8px",
    boxSizing: "border-box",
    border: conflict
      ? "1px solid #dc2626"
      : "1px solid #cbd5e1",
    borderRadius: "6px",
    fontFamily: "inherit"
  };

  return (
    <div style={{ minWidth: "170px" }}>
      {options[type] ? (
        <select
          value={draft}
          onChange={(event) =>
            setDraft(event.target.value)
          }
          disabled={saving || conflict}
          onKeyDown={handleKeyDown}
          autoFocus
          style={inputStyle}
        >
          {options[type].map((option) => (
            <option
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>
      ) : field === "notes" || field === "address" ? (
        <textarea
          value={draft}
          onChange={(event) =>
            setDraft(event.target.value)
          }
          disabled={saving || conflict}
          maxLength={limits[field]}
          onKeyDown={handleKeyDown}
          autoFocus
          rows={3}
          style={inputStyle}
        />
      ) : (
        <input
          type={type === "date" ? "date" : "text"}
          value={draft}
          onChange={(event) =>
            setDraft(event.target.value)
          }
          disabled={saving || conflict}
          maxLength={limits[field]}
          onKeyDown={handleKeyDown}
          autoFocus
          dir={
            type === "date" ||
            field === "nationalId" ||
            field === "studentCode" ||
            field === "birthYear" ||
            field === "phone" ||
            field === "phone2" ||
            field === "emergencyPhone"
              ? "ltr"
              : "rtl"
          }
          style={inputStyle}
        />
      )}

      {error && (
        <p
          role="alert"
          style={{
            color: "#dc2626",
            fontSize: "12px"
          }}
        >
          {error}
        </p>
      )}

      {conflict && (
        <div
          style={{
            padding: "10px",
            backgroundColor: "#fff7ed",
            borderRadius: "6px"
          }}
        >
          <p>القيمة الحالية:</p>
          <strong>
            {display(value, type)}
          </strong>

          <button
            type="button"
            onClick={refreshEditVersion}
            style={{
              display: "block",
              marginTop: "8px"
            }}
          >
            اعتماد القيمة الجديدة
          </button>
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: "5px",
          marginTop: "8px"
        }}
      >
        <button
          type="button"
          onClick={save}
          disabled={saving || conflict}
        >
          {saving ? "جارٍ الحفظ..." : "حفظ"}
        </button>

        <button
          type="button"
          onClick={cancelEditing}
          disabled={saving}
        >
          إلغاء
        </button>
      </div>
    </div>
  );
}