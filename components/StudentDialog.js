
"use client";

import { useEffect, useRef, useState } from "react";
import ParentLinkCell from "./ParentLinkCell";
import StudentPhoto, { toJpeg } from "./StudentPhoto";
import { redirectIfSignedOut, SESSION_EXPIRED } from "./session";
import { closeOnBackdrop, confirmDiscard } from "./dialog";
import { formatDate } from "../lib/arabic";
import {
  ATTENDANCE_TYPES,
  PAYMENT_METHODS,
  PAYMENT_PLANS,
  PAYMENT_TYPES,
  classLabel,
  formatMoney,
  fullName,
  isSummerYear,
  yearLabel
} from "../lib/labels";
import { REFUND_TYPES } from "../lib/finance";

// Student fields, saved with PATCH /api/students/[id] { fields }.
function studentFields(lines, isNew) {
  return [
    { name: "firstName", label: "الاسم", max: 100, required: true },
    { name: "fatherName", label: "اسم الأب", max: 100 },
    { name: "grandfatherName", label: "اسم الجد", max: 100 },
    { name: "lastName", label: "اللقب", max: 100 },
    {
      name: "studentCode",
      label: isNew ? "رمز الطفل (تلقائي إن تُرك فارغاً)" : "رمز الطفل",
      max: 50,
      required: !isNew,
      ltr: true
    },
    { name: "birthYear", label: "المواليد (السنة)", max: 4, ltr: true },
    {
      name: "gender",
      label: "الجنس",
      options: [
        ["", "غير محدد"],
        ["MALE", "ذكر"],
        ["FEMALE", "أنثى"]
      ]
    },
    { name: "nationalId", label: "الرقم الوطني", max: 30, ltr: true },
    { name: "emergencyPhone", label: "هاتف الطوارئ", max: 30, ltr: true },
    {
      name: "transportLineId",
      label: "خط النقل",
      options: [["", "بدون خط"], ...lines.map((line) => [String(line.id), `خط ${line.name}`])]
    },
    {
      name: "status",
      label: "الحالة",
      options: [
        ["ACTIVE", "نشط"],
        ["INACTIVE", "غير نشط (ألغي التسجيل)"]
      ]
    },
    { name: "address", label: "السكن", max: 500, multiline: true },
    { name: "notes", label: "ملاحظات", max: 500, multiline: true }
  ];
}

function valuesOf(student) {
  return {
    firstName: student.firstName ?? "",
    fatherName: student.fatherName ?? "",
    grandfatherName: student.grandfatherName ?? "",
    lastName: student.lastName ?? "",
    studentCode: student.studentCode ?? "",
    birthYear: student.birthYear ? String(student.birthYear) : "",
    gender: student.gender ?? "",
    nationalId: student.nationalId ?? "",
    emergencyPhone: student.emergencyPhone ?? "",
    transportLineId: student.transportLine ? String(student.transportLine.id) : "",
    status: student.status ?? "ACTIVE",
    address: student.address ?? "",
    notes: student.notes ?? "",
    reviewNote: student.reviewNote ?? ""
  };
}

// Enrollment fields, saved with PUT /api/students/[id]/enrollment.
function enrollmentOf(student) {
  const e = student.enrollment;

  return {
    classId: e?.class ? String(e.class.id) : "",
    attendanceType: e?.attendanceType ?? "",
    paymentPlan: e?.paymentPlan ?? "",
    tuitionFee: e ? String(student.financial.tuitionFee) : "",
    enrollmentDate: e ? String(e.enrollmentDate ?? "").slice(0, 10) : ""
  };
}

const changedKeys = (form, original) =>
  Object.keys(form).filter((key) => form[key] !== original[key]);

async function send(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  if (redirectIfSignedOut(response)) {
    throw new Error(SESSION_EXPIRED);
  }

  return { response, data: await response.json() };
}

export default function StudentDialog({
  student,
  isNew = false,
  initialClassId = "",
  options,
  onClose,
  onSaved,
  onCreated,
  onDeleted,
  onFamilyChanged,
  onEditingChange
}) {
  const dialogRef = useRef(null);
  const fields = studentFields(options.lines, isNew);

  const [original, setOriginal] = useState(() => valuesOf(student));
  const [form, setForm] = useState(original);
  const [enrollOriginal, setEnrollOriginal] = useState(() => enrollmentOf(student));
  const [enroll, setEnroll] = useState(() =>
    isNew ? { ...enrollOriginal, classId: initialClassId } : enrollOriginal
  );
  // Only when creating: parents are linked by phone in the same request.
  const [newParents, setNewParents] = useState({ fatherPhone: "", motherName: "", motherPhone: "" });
  const [version, setVersion] = useState(student.updatedAt);
  const [serverValues, setServerValues] = useState(null);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState(null);

  const changed = changedKeys(form, original);
  const enrollChanged = changedKeys(enroll, enrollOriginal);
  const dirty = isNew
    ? [...Object.values(form), ...Object.values(newParents), enroll.tuitionFee].some(
        (value) => value && value !== "ACTIVE"
      )
    : changed.length > 0 || enrollChanged.length > 0;

  // Open as a modal, and keep the table from polling underneath it.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    onEditingChange?.(true);

    return () => onEditingChange?.(false);
  }, []);

  // A parent's name or phone being edited in its own cell (saved on Enter)
  // counts as unsaved too.
  const openCells = useRef(0);
  function cellEditing(isEditing) {
    openCells.current = Math.max(0, openCells.current + (isEditing ? 1 : -1));
    onEditingChange?.(isEditing);
  }

  function requestClose() {
    if (saving) return;

    if (
      (dirty || openCells.current > 0) &&
      !confirmDiscard(
        isNew ? "طفل جديد" : `تعديل: ${fullName(student)}`,
        isNew
          ? []
          : [
              ...fields.filter((f) => changed.includes(f.name)).map((f) => [f.label, displayOption(f, original[f.name]), displayOption(f, form[f.name])]),
              ...enrollmentFields.filter((f) => enrollChanged.includes(f.name)).map((f) => [f.label, displayOption(f, enrollOriginal[f.name]), displayOption(f, enroll[f.name])])
            ],
        openCells.current > 0 ? ["بيانات الأب أو الأم قيد التعديل (تُحفظ بـ Enter)"] : []
      )
    ) {
      return;
    }

    onClose();
  }

  function showFieldError(name, message) {
    setFieldError({ name, message });
    document.getElementById(`student-${name}`)?.focus();
  }

  async function save(event) {
    event.preventDefault();

    if (saving) return;

    if (isNew) {
      await create();
      return;
    }

    if (!dirty) {
      onClose();
      return;
    }

    setSaving(true);
    setError("");
    setFieldError(null);

    try {
      let latest = null;

      if (changed.length > 0) {
        const { response, data } = await send(`/api/students/${student.id}`, "PATCH", {
          fields: Object.fromEntries(changed.map((name) => [name, form[name]])),
          updatedAt: version
        });

        // Someone else saved this child meanwhile. Keep what the user typed,
        // show the other user's values beside the fields they changed, and
        // let a second save knowingly overwrite them.
        if (response.status === 409 && data.code === "EDIT_CONFLICT") {
          const current = valuesOf(data.student);

          setServerValues(
            Object.fromEntries(
              Object.keys(current)
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
          if (data.field) return showFieldError(data.field, data.error);
          throw new Error(data.error || "تعذر حفظ التغييرات.");
        }

        latest = data.student;
        setOriginal(valuesOf(latest));
        setVersion(latest.updatedAt);
      }

      if (enrollChanged.length > 0) {
        if (!enroll.classId) {
          return showFieldError("classId", "يرجى اختيار الشعبة.");
        }

        const { response, data } = await send(
          `/api/students/${student.id}/enrollment`,
          "PUT",
          enroll
        );

        if (!response.ok) {
          if (latest) onSaved(latest);
          if (data.field) return showFieldError(data.field, data.error);
          throw new Error(data.error || "تعذر حفظ بيانات التسجيل.");
        }

        latest = data.student;
      }

      onSaved(latest);
      onClose();
    } catch (err) {
      setError(err.message || "حدث خطأ في الاتصال بالخادم.");
    } finally {
      setSaving(false);
    }
  }

  // One request creates the child, the registration and the parents, so a
  // rejected value leaves nothing half-saved. On success the table swaps
  // this window for the new child's own edit window (photo, payments,
  // linking an existing parent).
  async function create() {
    setSaving(true);
    setError("");
    setFieldError(null);

    try {
      // From the summer view a child without a section would be saved
      // outside the summer course, and not appear in that view.
      if (isSummerYear(options.academicYear) && !enroll.classId) {
        return showFieldError("classId", "يرجى اختيار شعبة الدورة الصيفية.");
      }

      const { response, data } = await send("/api/students", "POST", {
        fields: Object.fromEntries(
          Object.entries(form).filter(([name, value]) => value !== "" && name !== "reviewNote")
        ),
        enrollment: enroll.classId ? enroll : null,
        parents: newParents
      });

      if (!response.ok) {
        if (data.field) return showFieldError(data.field, data.error);
        throw new Error(data.error || "تعذر تسجيل الطفل.");
      }

      onCreated(data.student, data.linkedExistingParents);
    } catch (err) {
      setError(err.message || "حدث خطأ في الاتصال بالخادم.");
    } finally {
      setSaving(false);
    }
  }

  // Permanent. The message steers people who only want to record that a
  // child left towards «غير نشط», which keeps the payment history.
  async function deleteStudent() {
    if (saving) return;

    const payments = student.enrollment?.payments.length || 0;
    const message = [
      `حذف «${fullName(student)}» نهائياً؟`,
      "",
      `سيتم حذف بيانات الطفل وتسجيله${payments ? ` و${payments} دفعات` : ""} وسجل الحضور والصورة، ولا يمكن التراجع عن ذلك.`,
      "",
      "إذا كان الطفل قد ترك الروضة فالأفضل تغيير الحالة إلى «غير نشط» للاحتفاظ بسجله المالي."
    ].join("\n");

    if (!window.confirm(message)) return;

    setSaving(true);
    setError("");

    try {
      const { response, data } = await send(`/api/students/${student.id}`, "DELETE");
      if (!response.ok) throw new Error(data.error || "تعذر حذف الطفل.");
      onDeleted(student.id);
    } catch (err) {
      setError(err.message);
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
    padding: "8px",
    border: `1px solid ${
      fieldError?.name === name
        ? "#dc2626"
        : serverValues && name in serverValues
          ? "#f59e0b"
          : "#cbd5e1"
    }`,
    borderRadius: "6px",
    fontSize: "14px",
    backgroundColor: "#ffffff"
  });

  const labelStyle = (wide) => ({
    display: "grid",
    gap: "3px",
    gridColumn: wide ? "1 / -1" : undefined,
    fontSize: "13px",
    color: "#475569"
  });

  const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
    gap: "10px 14px"
  };

  const sectionTitle = { margin: "18px 0 8px", color: "#1e40af", fontSize: "16px" };
  const formId = `student-form-${student.id}`;
  const cls = student.enrollment?.class;

  function fieldControl(field, value, onChange) {
    const common = {
      id: `student-${field.name}`,
      value,
      disabled: saving,
      onChange: (event) => onChange(event.target.value),
      style: inputStyle(field.name)
    };

    if (field.options) {
      return (
        <select {...common}>
          {field.options.map(([optionValue, text]) => (
            <option key={optionValue} value={optionValue}>{text}</option>
          ))}
        </select>
      );
    }

    if (field.multiline) {
      return <textarea {...common} rows={2} maxLength={field.max} onKeyDown={multilineKeyDown} />;
    }

    return (
      <input
        {...common}
        type={field.type || "text"}
        inputMode={field.name === "birthYear" || field.name === "tuitionFee" ? "numeric" : undefined}
        maxLength={field.max}
        required={field.required}
        dir={field.ltr || field.type === "date" ? "ltr" : "rtl"}
      />
    );
  }

  function fieldNotes(field) {
    return (
      <>
        {fieldError?.name === field.name && (
          <small role="alert" style={{ color: "#dc2626" }}>{fieldError.message}</small>
        )}
        {serverValues && field.name in serverValues && (
          <small style={{ color: "#b45309" }}>
            القيمة الحالية: {displayOption(field, serverValues[field.name])}
          </small>
        )}
      </>
    );
  }

  const enrollmentFields = [
    {
      name: "classId",
      label: "الشعبة",
      options: [["", "— اختر الشعبة —"], ...options.classes.map((c) => [String(c.id), classLabel(c) + (c.teacherName ? ` — ${c.teacherName}` : "")])]
    },
    {
      name: "attendanceType",
      label: "نوع الدوام",
      options: [["", "غير محدد"], ...Object.entries(ATTENDANCE_TYPES)]
    },
    {
      name: "paymentPlan",
      label: "طريقة الدفع",
      options: [["", "غير محدد"], ...Object.entries(PAYMENT_PLANS)]
    },
    { name: "tuitionFee", label: "المبلغ الإجمالي (د.ع)", max: 20, ltr: true },
    { name: "enrollmentDate", label: "تاريخ المباشرة", type: "date" }
  ];

  return (
    <dialog
      ref={dialogRef}
      dir="rtl"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      {...closeOnBackdrop(requestClose)}
      style={{
        width: "min(860px, 96vw)",
        maxHeight: "94vh",
        padding: 0,
        border: "none",
        borderRadius: "14px",
        boxShadow: "0 20px 60px rgba(15, 23, 42, 0.3)"
      }}
    >
      <div style={{ padding: "20px 22px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          {!isNew && <StudentPhoto student={student} size={84} />}

          <div style={{ flex: 1, minWidth: "200px" }}>
            <h2 style={{ margin: "0 0 2px", color: "#1e40af" }}>
              {isNew ? "طفل جديد" : fullName(student)}
            </h2>
            {isNew && (
              <div style={{ color: "#64748b" }}>
                بعد الحفظ تستطيع إضافة الصورة والدفعات أو ربط أخ/أخت مسجل.
              </div>
            )}
            {!isNew && (
            <div style={{ color: "#64748b", marginBottom: "8px" }}>
              {student.studentCode}
              {cls && ` — ${classLabel(cls)}`}
              {cls?.teacherName && ` — المرشدة: ${cls.teacherName}`}
            </div>
            )}

            {!isNew && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <label
                style={{
                  padding: "6px 14px",
                  backgroundColor: "#eff6ff",
                  color: "#1e40af",
                  borderRadius: "6px",
                  cursor: photoBusy ? "wait" : "pointer"
                }}
              >
                {photoBusy ? "جارٍ الحفظ..." : student.photo ? "تغيير الصورة" : "إضافة صورة"}
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
                <button type="button" onClick={removePhoto} disabled={photoBusy}>
                  حذف الصورة
                </button>
              )}
            </div>
            )}
          </div>
        </div>

        <form id={formId} onSubmit={save}>
          {(form.reviewNote || original.reviewNote) && (
            <div
              style={{
                marginTop: "14px",
                padding: "10px 12px",
                backgroundColor: "#fffbeb",
                border: "1px solid #fcd34d",
                borderRadius: "8px"
              }}
            >
              <label style={labelStyle(true)}>
                <span style={{ color: "#92400e", fontWeight: 600 }}>⚠ بحاجة إلى مراجعة</span>
                <textarea
                  id="student-reviewNote"
                  value={form.reviewNote}
                  disabled={saving}
                  rows={2}
                  maxLength={1000}
                  onKeyDown={multilineKeyDown}
                  onChange={(event) => setForm((p) => ({ ...p, reviewNote: event.target.value }))}
                  style={inputStyle("reviewNote")}
                />
              </label>
              {form.reviewNote && (
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, reviewNote: "" }))}
                  style={{ marginTop: "6px" }}
                >
                  ✓ تمت المراجعة
                </button>
              )}
            </div>
          )}

          <h3 style={sectionTitle}>بيانات الطفل</h3>
          <div style={grid}>
            {fields.map((field) => (
              <label key={field.name} style={labelStyle(field.multiline)}>
                <span>
                  {field.label}
                  {field.required && <span style={{ color: "#dc2626" }}> *</span>}
                </span>
                {fieldControl(field, form[field.name], (value) =>
                  setForm((previous) => ({ ...previous, [field.name]: value }))
                )}
                {fieldNotes(field)}
              </label>
            ))}
          </div>

          {isNew && (
            <>
              <h3 style={sectionTitle}>الوالدان</h3>
              <div style={grid}>
                {[
                  ["fatherPhone", "رقم هاتف الأب", true],
                  ["motherName", "اسم الأم", false],
                  ["motherPhone", "رقم هاتف الأم", true]
                ].map(([name, label, phone]) => (
                  <label key={name} style={labelStyle(false)}>
                    <span>{label}</span>
                    <input
                      id={`student-${name}`}
                      value={newParents[name]}
                      disabled={saving}
                      maxLength={phone ? 30 : 100}
                      dir={phone ? "ltr" : "rtl"}
                      inputMode={phone ? "tel" : undefined}
                      placeholder={phone ? "07XXXXXXXXX" : undefined}
                      onChange={(event) =>
                        setNewParents((previous) => ({ ...previous, [name]: event.target.value }))
                      }
                      style={inputStyle(name)}
                    />
                    {fieldNotes({ name })}
                  </label>
                ))}
              </div>
              <small style={{ color: "#64748b" }}>
                اسم الأب يؤخذ من اسم الطفل. إذا كان رقم الهاتف مسجلاً لأخ أو أخت، يُربط الطفل بنفس الوالد.
              </small>
            </>
          )}

          <h3 style={sectionTitle}>{isSummerYear(options.academicYear) ? "التسجيل في الدورة الصيفية" : "التسجيل والرسوم"}</h3>
          <div style={grid}>
            {enrollmentFields.map((field) => (
              <label key={field.name} style={labelStyle(false)}>
                <span>{field.label}</span>
                {fieldControl(field, enroll[field.name], (value) =>
                  setEnroll((previous) => ({ ...previous, [field.name]: value }))
                )}
                {fieldNotes(field)}
              </label>
            ))}
          </div>
        </form>

        {/* Outside the form above: these render forms of their own. */}
        {!isNew && (
        <>
        <Payments student={student} onSaved={onSaved} disabled={saving} />

        {!isSummerYear(options.academicYear) && options.summerYear && (
          <SummerEnrollment student={student} options={options} onSaved={onSaved} disabled={saving} />
        )}

        <h3 style={sectionTitle}>الوالدان</h3>
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
              style={{ padding: "10px", border: "1px solid #e2e8f0", borderRadius: "8px" }}
            >
              <div style={{ fontSize: "13px", color: "#475569", marginBottom: "6px" }}>{label}</div>
              <ParentLinkCell
                studentId={student.id}
                relation={relation}
                parent={student[key]}
                onChanged={onFamilyChanged}
                onEditingChange={cellEditing}
              />
            </div>
          ))}
        </div>
        </>
        )}

        {error && (
          <p role="alert" style={{ color: "#dc2626" }}>{error}</p>
        )}

        <div
          style={{
            position: "sticky",
            bottom: "-20px",
            display: "flex",
            gap: "10px",
            marginTop: "18px",
            padding: "12px 0",
            backgroundColor: "#ffffff",
            borderTop: "1px solid #e2e8f0"
          }}
        >
          <button
            type="submit"
            form={formId}
            disabled={saving}
            style={{
              padding: "10px 28px",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              cursor: saving ? "wait" : "pointer"
            }}
          >
            {saving ? "جارٍ الحفظ..." : isNew ? "حفظ ومتابعة" : "حفظ"}
          </button>

          <button
            type="button"
            onClick={requestClose}
            disabled={saving}
            style={{ padding: "10px 20px", borderRadius: "8px" }}
          >
            إغلاق
          </button>

          {!isNew && (
          <button
            type="button"
            onClick={deleteStudent}
            disabled={saving}
            style={{
              marginInlineStart: "auto",
              padding: "10px 16px",
              borderRadius: "8px",
              border: "1px solid #fecaca",
              backgroundColor: "#ffffff",
              color: "#b91c1c",
              cursor: "pointer"
            }}
          >
            حذف الطفل
          </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

// الدفعات: each payment is saved immediately, separately from the form.
function Payments({ student, onSaved, disabled }) {
  // enrollmentId "": the current year; otherwise an earlier year's debt.
  const [draft, setDraft] = useState({ amount: "", paymentType: "TUITION", paymentMethod: "CASH", description: "", enrollmentId: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // The payment just recorded, offered for printing.
  const [lastReceipt, setLastReceipt] = useState(null);

  const enrollment = student.enrollment;
  const { tuitionFee, totalPaid, remaining, curriculumPaid, overdue, nextDue, previousDue = [] } = student.financial;

  async function add(event) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      // Always the enrollment shown (the summer course's in its view).
      const { response, data } = await send(`/api/students/${student.id}/payments`, "POST", {
        ...draft,
        enrollmentId: draft.enrollmentId || enrollment.id
      });
      if (!response.ok) throw new Error(data.error || "تعذر حفظ الدفعة.");

      onSaved(data.student);
      setLastReceipt(data.payment);
      setDraft({ ...draft, amount: "", description: "", enrollmentId: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Receipts are voided, never deleted: the number stays on record.
  async function voidPayment(payment) {
    const label = payment.receiptNo ? `الوصل ${payment.receiptNo}` : "هذه الدفعة";
    const reason = window.prompt(
      `إلغاء ${label} بمبلغ ${formatMoney(payment.amount)} د.ع؟\nيبقى الوصل في السجل مع علامة «ملغى» ولا يُحسب.\n\nسبب الإلغاء (اختياري):`,
      ""
    );
    if (reason === null) return;

    setBusy(true);
    setError("");

    try {
      const { response, data } = await send(`/api/payments/${payment.id}`, "PATCH", { void: true, reason });
      if (!response.ok) throw new Error(data.error || "تعذر إلغاء الوصل.");
      onSaved(data.student);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // A child who has left owes nothing more: show only what was agreed and paid.
  const active = student.status === "ACTIVE";
  const summary = [
    ["المبلغ الإجمالي", tuitionFee],
    ["الواصل", totalPaid, "#15803d"],
    ...(active
      ? [
          ["الباقي", remaining, remaining > 0 ? "#b91c1c" : undefined],
          ["متأخر حتى اليوم", overdue, overdue > 0 ? "#b91c1c" : "#15803d"],
          ["المنهج والزي", curriculumPaid]
        ]
      : [])
  ];

  const cell = { padding: "6px 8px", borderBottom: "1px solid #f1f5f9", textAlign: "right" };
  const control = { padding: "7px", border: "1px solid #cbd5e1", borderRadius: "6px", backgroundColor: "#fff" };

  return (
    <>
      <h3 style={{ margin: "18px 0 8px", color: "#1e40af", fontSize: "16px" }}>الدفعات</h3>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
        {summary.map(([label, value, color]) => (
          <div key={label} style={{ padding: "8px 14px", backgroundColor: "#f8fafc", borderRadius: "8px" }}>
            <div style={{ fontSize: "12px", color: "#64748b" }}>{label}</div>
            <strong style={{ color }}>{formatMoney(value)}</strong>
          </div>
        ))}
      </div>

      {active && previousDue.map((due) => (
        <p key={due.enrollmentId} style={{ margin: "0 0 6px", color: "#b91c1c", fontSize: "13px" }}>
          باقي من السنة <span dir="ltr">{due.year}</span>: <strong>{formatMoney(due.remaining)}</strong> د.ع
          (محسوب ضمن المتأخر؛ سجّل دفعته «عن» تلك السنة)
        </p>
      ))}

      {active && nextDue && (
        <p style={{ margin: "0 0 10px", color: "#64748b", fontSize: "13px" }}>
          القسط القادم: {formatMoney(nextDue.amount)} د.ع في {formatDate(nextDue.day)}
        </p>
      )}

      {lastReceipt && (
        <p role="status" style={{ margin: "0 0 10px", color: "#15803d" }}>
          ✓ سُجّلت الدفعة — وصل رقم <strong dir="ltr">{lastReceipt.receiptNo}</strong>{" "}
          <a href={`/dashboard/receipts/${lastReceipt.id}`} target="_blank" rel="noopener noreferrer">
            🖨 طباعة الوصل
          </a>
        </p>
      )}

      {!enrollment ? (
        <p style={{ color: "#64748b" }}>اختر الشعبة واحفظ أولاً لتسجيل الدفعات.</p>
      ) : (
        <>
          {enrollment.payments.some((p) => !p.voidedAt) && (
            <button
              type="button"
              onClick={() => window.open(
                `/dashboard/receipts/student/${student.id}${enrollment.academicYear.kind === "SUMMER" ? "?term=summer" : ""}`,
                "_blank",
                "noopener"
              )}
              style={{ marginBottom: "8px" }}
            >
              طباعة كل الوصولات
            </button>
          )}

          {enrollment.payments.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                <thead>
                  <tr style={{ color: "#64748b" }}>
                    <th style={cell}>الوصل</th>
                    <th style={cell}>التاريخ</th>
                    <th style={cell}>النوع</th>
                    <th style={cell}>نوع الدفع</th>
                    <th style={{ ...cell, textAlign: "left" }}>المبلغ</th>
                    <th style={cell}>الفترة / ملاحظة</th>
                    <th style={cell} />
                  </tr>
                </thead>
                <tbody>
                  {enrollment.payments.map((payment) => {
                    const voided = Boolean(payment.voidedAt);
                    const struck = voided ? { textDecoration: "line-through", color: "#94a3b8" } : undefined;

                    return (
                      <tr key={payment.id}>
                        <td style={{ ...cell, ...struck }} dir="ltr">{payment.receiptNo || "—"}</td>
                        <td style={{ ...cell, ...struck }}>{formatDate(payment.paymentDate)}</td>
                        <td style={{ ...cell, ...struck }}>{PAYMENT_TYPES[payment.paymentType] || "قسط"}</td>
                        <td style={{ ...cell, ...struck }}>{PAYMENT_METHODS[payment.paymentMethod] || "—"}</td>
                        <td style={{ ...cell, ...(REFUND_TYPES.includes(payment.paymentType) && { color: "#b91c1c" }), ...struck, textAlign: "left" }}>
                          {REFUND_TYPES.includes(payment.paymentType) ? "−" : ""}{formatMoney(payment.amount)}
                        </td>
                        <td style={cell}>
                          <span style={struck}>{payment.description || ""}</span>
                          {voided && (
                            <small style={{ color: "#b91c1c" }}>
                              {" "}ملغى{payment.voidReason ? `: ${payment.voidReason}` : ""}
                            </small>
                          )}
                        </td>
                        <td style={{ ...cell, whiteSpace: "nowrap" }}>
                          <button
                            type="button"
                            onClick={() => window.open(`/dashboard/receipts/${payment.id}`, "_blank", "noopener")}
                            title="طباعة الوصل"
                            style={{ marginInlineEnd: "6px" }}
                          >
                            طباعة
                          </button>
                          {!voided && (
                            <button
                              type="button"
                              disabled={busy || disabled}
                              onClick={() => voidPayment(payment)}
                              title="إلغاء الوصل (يبقى في السجل)"
                              style={{ color: "#b91c1c" }}
                            >
                              إلغاء
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <form onSubmit={add} style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
            <input
              aria-label="مبلغ الدفعة"
              placeholder="المبلغ"
              inputMode="numeric"
              dir="ltr"
              required
              value={draft.amount}
              onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
              style={{ ...control, width: "130px" }}
            />
            <select
              aria-label="نوع الدفعة"
              value={draft.paymentType}
              onChange={(e) => setDraft((d) => ({ ...d, paymentType: e.target.value }))}
              style={control}
            >
              {Object.entries(PAYMENT_TYPES).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            {previousDue.length > 0 && (
              <select
                aria-label="عن السنة الدراسية"
                value={draft.enrollmentId}
                onChange={(e) => setDraft((d) => ({ ...d, enrollmentId: e.target.value }))}
                style={control}
              >
                <option value="">عن {enrollment.academicYear.name}</option>
                {previousDue.map((due) => (
                  <option key={due.enrollmentId} value={due.enrollmentId}>عن {due.year} (باقي {formatMoney(due.remaining)})</option>
                ))}
              </select>
            )}
            <select
              aria-label="نوع الدفع"
              value={draft.paymentMethod}
              onChange={(e) => setDraft((d) => ({ ...d, paymentMethod: e.target.value }))}
              style={control}
            >
              {Object.entries(PAYMENT_METHODS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <input
              aria-label="الفترة أو ملاحظة"
              placeholder="الفترة المدفوعة أو ملاحظة"
              maxLength={500}
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              style={{ ...control, flex: "1 1 200px" }}
            />
            <button type="submit" disabled={busy || disabled}>
              {busy ? "جارٍ الحفظ..." : "+ إضافة دفعة"}
            </button>
          </form>
        </>
      )}

      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}
    </>
  );
}

// الدورة الصيفية, from the school year's view: register the child for
// the active summer course (its own section, fee and plan), or show how
// that registration stands. Its payments are made in the summer view.
function SummerEnrollment({ student, options, onSaved, disabled }) {
  const [draft, setDraft] = useState({ classId: "", tuitionFee: "", paymentPlan: "", enrollmentDate: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const summer = student.summer;
  const control = { padding: "7px", border: "1px solid #cbd5e1", borderRadius: "6px", backgroundColor: "#fff" };
  const set = (key, value) => setDraft((d) => ({ ...d, [key]: value }));

  async function enroll(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { response, data } = await send(`/api/students/${student.id}/enrollment`, "PUT", draft);
      if (!response.ok) throw Object.assign(new Error(data.error || "تعذر التسجيل."), { field: data.field });
      onSaved(data.student);
    } catch (err) {
      setError({ message: err.message, field: err.field });
    } finally {
      setBusy(false);
    }
  }

  const border = (field) => (error?.field === field ? { borderColor: "#dc2626" } : undefined);

  return (
    <>
      <h3 style={{ margin: "18px 0 8px", color: "#ea580c", fontSize: "16px" }}>{yearLabel(options.summerYear)}</h3>
      {summer ? (
        <p style={{ margin: 0 }}>
          مسجل في {classLabel(summer.enrollment.class)} — المبلغ {formatMoney(summer.financial.tuitionFee)}،
          الواصل {formatMoney(summer.financial.totalPaid)}،{" "}
          <span style={{ color: summer.financial.remaining > 0 ? "#b91c1c" : undefined }}>
            الباقي {formatMoney(summer.financial.remaining)}
          </span>{" "}
          <a href="/dashboard/students?term=summer">الدفعات في «الدورة الصيفية» ←</a>
        </p>
      ) : options.summerClasses?.length ? (
        <form onSubmit={enroll} style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
          <select aria-label="شعبة الدورة الصيفية" required value={draft.classId} onChange={(e) => set("classId", e.target.value)} style={{ ...control, ...border("classId") }}>
            <option value="">— الشعبة —</option>
            {options.summerClasses.map((c) => (
              <option key={c.id} value={c.id}>{classLabel(c)}{c.teacherName ? ` — ${c.teacherName}` : ""}</option>
            ))}
          </select>
          <input aria-label="المبلغ الإجمالي" placeholder="المبلغ الإجمالي" dir="ltr" inputMode="numeric" value={draft.tuitionFee} onChange={(e) => set("tuitionFee", e.target.value)} style={{ ...control, ...border("tuitionFee"), width: "130px" }} />
          <select aria-label="طريقة الدفع" value={draft.paymentPlan} onChange={(e) => set("paymentPlan", e.target.value)} style={control}>
            <option value="">طريقة الدفع</option>
            {Object.entries(PAYMENT_PLANS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            المباشرة
            <input type="date" value={draft.enrollmentDate} onChange={(e) => set("enrollmentDate", e.target.value)} style={{ ...control, ...border("enrollmentDate") }} />
          </label>
          <button type="submit" disabled={busy || disabled}>{busy ? "جارٍ التسجيل..." : "تسجيل في الدورة الصيفية"}</button>
        </form>
      ) : (
        <p style={{ color: "#64748b", margin: 0 }}>لا توجد شعب للدورة الصيفية.</p>
      )}
      {error && <p role="alert" style={{ color: "#dc2626" }}>{error.message}</p>}
    </>
  );
}

function displayOption(field, value) {
  if (field.options) {
    return field.options.find(([option]) => option === value)?.[1] ?? value;
  }

  return value || "—";
}
