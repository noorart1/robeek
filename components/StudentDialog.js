
"use client";

import { useEffect, useRef, useState } from "react";
import ParentLinkCell from "./ParentLinkCell";
import StudentPhoto, { toJpeg } from "./StudentPhoto";
import { redirectIfSignedOut, SESSION_EXPIRED } from "./session";

const fields = [
  { name: "studentCode", label: "رمز الطفل", max: 50, required: true },
  { name: "firstName", label: "الاسم", max: 100, required: true },
  { name: "lastName", label: "اللقب", max: 100, required: true },
  { name: "nationalId", label: "الرقم الوطني", max: 30, ltr: true },
  { name: "birthDate", label: "تاريخ الميلاد", type: "date" },
  {
    name: "gender",
    label: "الجنس",
    options: [
      ["", "غير محدد"],
      ["MALE", "ذكر"],
      ["FEMALE", "أنثى"]
    ]
  },
  { name: "phone", label: "رقم الهاتف", max: 30, ltr: true },
  { name: "emergencyPhone", label: "هاتف الطوارئ", max: 30, ltr: true },
  {
    name: "status",
    label: "الحالة",
    options: [
      ["ACTIVE", "نشط"],
      ["INACTIVE", "غير نشط"]
    ]
  },
  { name: "address", label: "عنوان السكن", max: 500, multiline: true },
  { name: "notes", label: "ملاحظات", max: 500, multiline: true }
];

function valuesOf(student) {
  return Object.fromEntries(
    fields.map(({ name }) => [
      name,
      name === "birthDate"
        ? String(student.birthDate ?? "").slice(0, 10)
        : student[name] ?? ""
    ])
  );
}

export default function StudentDialog({
  student,
  onClose,
  onSaved,
  onFamilyChanged,
  onEditingChange
}) {
  const dialogRef = useRef(null);

  const [original, setOriginal] = useState(() => valuesOf(student));
  const [form, setForm] = useState(original);
  const [version, setVersion] = useState(student.updatedAt);
  const [serverValues, setServerValues] = useState(null);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState(null);

  const changed = fields
    .map(({ name }) => name)
    .filter((name) => form[name] !== original[name]);

  // Open as a modal, and keep the table from polling underneath it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    onEditingChange?.(true);

    return () => onEditingChange?.(false);
  }, []);

  function requestClose() {
    if (saving) return;

    if (
      changed.length > 0 &&
      !window.confirm("هل تريد إغلاق النافذة دون حفظ التغييرات؟")
    ) {
      return;
    }

    onClose();
  }

  async function save(event) {
    event.preventDefault();

    if (saving) return;

    if (changed.length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    setError("");
    setFieldError(null);

    try {
      const response = await fetch(`/api/students/${student.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: Object.fromEntries(
            changed.map((name) => [name, form[name]])
          ),
          updatedAt: version
        })
      });

      if (redirectIfSignedOut(response)) {
        throw new Error(SESSION_EXPIRED);
      }

      const data = await response.json();

      // Someone else saved this child meanwhile. Keep what the user typed,
      // show the other user's values beside the fields they changed, and
      // let a second save knowingly overwrite them.
      if (response.status === 409 && data.code === "EDIT_CONFLICT") {
        const current = valuesOf(data.student);

        setServerValues(
          Object.fromEntries(
            fields
              .map(({ name }) => name)
              .filter((name) => current[name] !== original[name])
              .map((name) => [name, current[name]])
          )
        );
        setOriginal(current);
        setVersion(data.student.updatedAt);
        onSaved(data.student);
        setError(
          "قام مستخدم آخر بتعديل بيانات هذا الطفل أثناء التحرير. راجع القيم المشار إليها ثم اضغط حفظ مرة أخرى."
        );
        return;
      }

      if (!response.ok) {
        if (data.field) {
          setFieldError({ name: data.field, message: data.error });
          document.getElementById(`student-${data.field}`)?.focus();
          return;
        }

        throw new Error(data.error || "تعذر حفظ التغييرات.");
      }

      onSaved(data.student);
      onClose();
    } catch (err) {
      setError(err.message || "حدث خطأ في الاتصال بالخادم.");
    } finally {
      setSaving(false);
    }
  }

  async function changePhoto(file) {
    if (!file) return;

    setPhotoBusy(true);
    setError("");

    try {
      let jpeg;

      try {
        jpeg = await toJpeg(file);
      } catch {
        throw new Error("تعذر قراءة الصورة. يرجى اختيار صورة بصيغة JPG أو PNG.");
      }

      await sendPhoto("PUT", jpeg);
    } catch (err) {
      setError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    if (!window.confirm("هل تريد حذف صورة الطفل؟")) return;

    setPhotoBusy(true);
    setError("");

    try {
      await sendPhoto("DELETE");
    } catch (err) {
      setError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function sendPhoto(method, body) {
    const response = await fetch(`/api/students/${student.id}/photo`, {
      method,
      headers: body ? { "Content-Type": "image/jpeg" } : undefined,
      body
    });

    if (redirectIfSignedOut(response)) {
      throw new Error(SESSION_EXPIRED);
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "تعذر حفظ الصورة.");
    }

    onSaved(data.student);
  }

  // Enter saves from any field, as in the table; Shift+Enter makes a
  // new line in the multi-line fields.
  function multilineKeyDown(event) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form.requestSubmit();
    }
  }

  const inputStyle = (name) => ({
    width: "100%",
    boxSizing: "border-box",
    padding: "9px",
    border: `1px solid ${
      fieldError?.name === name
        ? "#dc2626"
        : serverValues && name in serverValues
          ? "#f59e0b"
          : "#cbd5e1"
    }`,
    borderRadius: "6px",
    fontFamily: "inherit",
    fontSize: "14px"
  });

  return (
    <dialog
      ref={dialogRef}
      dir="rtl"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      style={{
        width: "min(760px, 95vw)",
        maxHeight: "92vh",
        padding: 0,
        border: "none",
        borderRadius: "14px",
        boxShadow: "0 20px 60px rgba(15, 23, 42, 0.3)"
      }}
    >
      <div style={{ padding: "22px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            flexWrap: "wrap",
            marginBottom: "18px"
          }}
        >
          <StudentPhoto student={student} size={88} />

          <div style={{ flex: 1, minWidth: "180px" }}>
            <h2 style={{ margin: "0 0 8px", color: "#1e40af" }}>
              {student.firstName} {student.lastName}
            </h2>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <label
                style={{
                  padding: "7px 14px",
                  backgroundColor: "#eff6ff",
                  color: "#1e40af",
                  borderRadius: "6px",
                  cursor: photoBusy ? "wait" : "pointer"
                }}
              >
                {photoBusy
                  ? "جارٍ الحفظ..."
                  : student.photo
                    ? "تغيير الصورة"
                    : "إضافة صورة"}
                <input
                  type="file"
                  accept="image/*"
                  disabled={photoBusy}
                  hidden
                  onChange={(event) => {
                    changePhoto(event.target.files[0]);
                    event.target.value = "";
                  }}
                />
              </label>

              {student.photo && (
                <button
                  type="button"
                  onClick={removePhoto}
                  disabled={photoBusy}
                >
                  حذف الصورة
                </button>
              )}
            </div>
          </div>
        </div>

        <form
          id={`student-form-${student.id}`}
          onSubmit={save}
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: "12px 16px"
          }}
        >
          {fields.map((field) => {
            const { name, label } = field;

            const common = {
              id: `student-${name}`,
              value: form[name],
              disabled: saving,
              onChange: (event) =>
                setForm((previous) => ({
                  ...previous,
                  [name]: event.target.value
                })),
              style: inputStyle(name)
            };

            return (
              <label
                key={name}
                style={{
                  display: "grid",
                  gap: "4px",
                  gridColumn: field.multiline ? "1 / -1" : undefined,
                  fontSize: "13px",
                  color: "#475569"
                }}
              >
                <span>
                  {label}
                  {field.required && <span style={{ color: "#dc2626" }}> *</span>}
                </span>

                {field.options ? (
                  <select {...common}>
                    {field.options.map(([value, text]) => (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    ))}
                  </select>
                ) : field.multiline ? (
                  <textarea
                    {...common}
                    rows={2}
                    maxLength={field.max}
                    onKeyDown={multilineKeyDown}
                  />
                ) : (
                  <input
                    {...common}
                    type={field.type || "text"}
                    maxLength={field.max}
                    required={field.required}
                    dir={field.ltr || field.type === "date" ? "ltr" : "rtl"}
                  />
                )}

                {fieldError?.name === name && (
                  <small role="alert" style={{ color: "#dc2626" }}>
                    {fieldError.message}
                  </small>
                )}

                {serverValues && name in serverValues && (
                  <small style={{ color: "#b45309" }}>
                    القيمة الحالية: {displayOption(field, serverValues[name])}
                  </small>
                )}
              </label>
            );
          })}
        </form>

        {/* Outside the form above: ParentLinkCell renders its own form. */}
        <h3 style={{ margin: "20px 0 8px", color: "#1e40af", fontSize: "16px" }}>
          الوالدان
        </h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "12px"
          }}
        >
          {[
            ["FATHER", "father", "الأب"],
            ["MOTHER", "mother", "الأم"]
          ].map(([relation, key, label]) => (
            <div
              key={relation}
              style={{
                padding: "10px",
                border: "1px solid #e2e8f0",
                borderRadius: "8px"
              }}
            >
              <div style={{ fontSize: "13px", color: "#475569", marginBottom: "6px" }}>
                {label}
              </div>
              <ParentLinkCell
                studentId={student.id}
                relation={relation}
                parent={student[key]}
                onChanged={onFamilyChanged}
                onEditingChange={onEditingChange}
              />
            </div>
          ))}
        </div>

        {error && (
          <p role="alert" style={{ color: "#dc2626" }}>
            {error}
          </p>
        )}

        <div
          style={{
            display: "flex",
            gap: "10px",
            justifyContent: "flex-start",
            marginTop: "20px"
          }}
        >
          <button
            type="submit"
            form={`student-form-${student.id}`}
            disabled={saving}
            style={{
              padding: "10px 26px",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontFamily: "inherit",
              cursor: saving ? "wait" : "pointer"
            }}
          >
            {saving ? "جارٍ الحفظ..." : "حفظ"}
          </button>

          <button
            type="button"
            onClick={requestClose}
            disabled={saving}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              fontFamily: "inherit"
            }}
          >
            إغلاق
          </button>
        </div>
      </div>
    </dialog>
  );
}

function displayOption(field, value) {
  if (field.options) {
    return field.options.find(([option]) => option === value)?.[1] ?? value;
  }

  return value || "—";
}
