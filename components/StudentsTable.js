
"use client";

import { useEffect, useRef, useState } from "react";
import EditableCell from "./EditableCell";
import ParentLinkCell from "./ParentLinkCell";
import StudentDialog from "./StudentDialog";
import StudentPhoto from "./StudentPhoto";
import { redirectIfSignedOut, SESSION_EXPIRED } from "./session";
import { formatDate, matchesSearch } from "../lib/arabic";
import {
  SHIFTS,
  attendanceLabel,
  classLabel,
  formatMoney,
  fullName,
  parentName
} from "../lib/labels";

// kind: "edit" = inline EditableCell, "parent" = ParentLinkCell,
// "view" = read-only (edited in the full dialog), "money" = read-only amount.
const columns = [
  { field: "studentCode", label: "الرمز", kind: "edit" },
  { field: "class", label: "الشعبة", kind: "view", value: (s) => classLabel(s.enrollment?.class) },
  { field: "birthYear", label: "المواليد", kind: "edit" },
  { field: "father", label: "الأب", kind: "parent", relation: "FATHER" },
  { field: "mother", label: "الأم", kind: "parent", relation: "MOTHER" },
  { field: "address", label: "السكن", kind: "edit" },
  { field: "attendance", label: "نوع الدوام", kind: "view", value: (s) => attendanceLabel(s.enrollment) },
  { field: "tuitionFee", label: "المبلغ الإجمالي", kind: "money" },
  { field: "totalPaid", label: "الواصل", kind: "money" },
  { field: "remaining", label: "الباقي", kind: "money" },
  { field: "curriculumPaid", label: "المنهج", kind: "money" },
  { field: "line", label: "خط النقل", kind: "view", value: (s) => s.transportLine?.name || "" },
  { field: "notes", label: "ملاحظات", kind: "edit" },
  { field: "status", label: "الحالة", kind: "edit", type: "status" },
  { field: "gender", label: "الجنس", kind: "edit", type: "gender" },
  { field: "nationalId", label: "الرقم الوطني", kind: "edit" },
  { field: "phone", label: "رقم الهاتف", kind: "edit" },
  { field: "emergencyPhone", label: "هاتف الطوارئ", kind: "edit" },
  { field: "birthDate", label: "تاريخ الميلاد", kind: "edit", type: "date" }
];

const moneyFields = columns.filter((c) => c.kind === "money").map((c) => c.field);

function displayValue(student, field) {
  const value = student[field];

  if (field === "birthDate") {
    return value ? String(value).slice(0, 10) : "";
  }

  return value === null || value === undefined ? "" : String(value);
}

// Morning before evening, then section, then code — the workbook's order.
function compareStudents(a, b) {
  const ca = a.enrollment?.class;
  const cb = b.enrollment?.class;

  if (!ca !== !cb) return ca ? -1 : 1;
  if (ca && cb) {
    if (ca.shift !== cb.shift) return ca.shift === "MORNING" ? -1 : 1;
    if (ca.name !== cb.name) return ca.name.localeCompare(cb.name);
  }

  return a.studentCode.localeCompare(b.studentCode, "en", { numeric: true });
}

// Widths of the two columns pinned to the right edge while the table
// scrolls sideways; the second one is offset by the first.
const INDEX_WIDTH = 44;
const NAME_WIDTH = 250;

const emptyForm = {
  firstName: "",
  fatherName: "",
  grandfatherName: "",
  classId: ""
};

export default function StudentsTable({ initialClassId = "", initialReview = false }) {
  const [students, setStudents] = useState([]);
  const [options, setOptions] = useState({ classes: [], lines: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [shift, setShift] = useState("");
  const [classId, setClassId] = useState(initialClassId);
  const [reviewOnly, setReviewOnly] = useState(initialReview);
  const [lastSync, setLastSync] = useState(null);
  const [dialogId, setDialogId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const refreshInProgress = useRef(false);
  const mutationInProgress = useRef(false);
  const requestVersion = useRef(0);
  const editingCount = useRef(0);

  function editingChanged(isEditing) {
    editingCount.current = Math.max(0, editingCount.current + (isEditing ? 1 : -1));
  }

  async function reloadAfterFamilyChange() {
    requestVersion.current += 1;
    try {
      const data = await fetchStudents();
      setStudents(data);
      setLastSync(new Date());
      setError("");
    } catch (err) { setError(err.message); }
  }

  async function fetchStudents() {
    const response = await fetch("/api/students", {
      cache: "no-store"
    });

    if (redirectIfSignedOut(response)) {
      throw new Error(SESSION_EXPIRED);
    }

    if (!response.ok) {
      throw new Error("تعذر تحميل بيانات الأطفال.");
    }

    const data = await response.json();

    if (!Array.isArray(data.students)) {
      throw new Error("صيغة البيانات غير صالحة.");
    }

    return data.students;
  }

  useEffect(() => {
    let active = true;

    async function initialLoad() {
      try {
        const [data, optionsResponse] = await Promise.all([
          fetchStudents(),
          fetch("/api/options", { cache: "no-store" })
        ]);

        if (!active) return;

        setStudents(data);
        if (optionsResponse.ok) setOptions(await optionsResponse.json());
        setLastSync(new Date());
        setError("");
      } catch (err) {
        if (active) {
          setError(err.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    initialLoad();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function refreshStudents() {
      if (
        refreshInProgress.current ||
        mutationInProgress.current ||
        editingCount.current > 0 ||
        document.visibilityState !== "visible"
      ) {
        return;
      }

      refreshInProgress.current = true;

      const currentVersion = requestVersion.current;

      try {
        const data = await fetchStudents();

        if (
          !active ||
          mutationInProgress.current ||
          editingCount.current > 0 ||
          currentVersion !== requestVersion.current
        ) {
          return;
        }

        setStudents(data);
        setLastSync(new Date());
        setError("");
      } catch (err) {
        if (active) {
          setError("تعذرت مزامنة البيانات مع الخادم.");
        }
      } finally {
        refreshInProgress.current = false;
      }
    }

    const interval = setInterval(refreshStudents, 10000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  async function addStudent(event) {
    event.preventDefault();

    if (saving || mutationInProgress.current) return;

    mutationInProgress.current = true;
    requestVersion.current += 1;

    setSaving(true);
    setError("");

    try {
      const response = await fetch("/api/students", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(form)
      });

      if (redirectIfSignedOut(response)) {
        throw new Error(SESSION_EXPIRED);
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "تعذر تسجيل الطفل."
        );
      }

      setStudents((previous) => [
        ...previous.filter(
          (student) => student.id !== data.student.id
        ),
        data.student
      ]);

      // Keep the chosen section: children are usually entered one class
      // at a time.
      setForm((previous) => ({ ...emptyForm, classId: previous.classId }));

      // Straight into the full form to fill in the rest of the details.
      setDialogId(data.student.id);

      setLastSync(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      mutationInProgress.current = false;
      setSaving(false);
    }
  }

  function handleStudentSaved(updatedStudent) {
    requestVersion.current += 1;

    setStudents((previous) =>
      previous.map((student) =>
        student.id === updatedStudent.id
          ? { ...student, ...updatedStudent }
          : student
      )
    );

    setLastSync(new Date());
  }

  const shownClasses = options.classes.filter((cls) => !shift || cls.shift === shift);

  const filteredStudents = students
    .filter((student) => {
      const cls = student.enrollment?.class;

      if (shift && cls?.shift !== shift) return false;
      if (classId && String(cls?.id) !== classId) return false;
      if (reviewOnly && !student.reviewNote) return false;

      const text = [
        fullName(student),
        ...columns.map((column) =>
          column.kind === "parent"
            ? [parentName(student[column.field]), student[column.field]?.phone].join(" ")
            : column.value
              ? column.value(student)
              : column.kind === "money"
                ? ""
                : column.field === "birthDate"
                  ? formatDate(student[column.field])
                  : displayValue(student, column.field)
        ),
        student.reviewNote
      ].join(" ");

      return matchesSearch(text, search);
    })
    .sort(compareStudents);

  const totals = Object.fromEntries(
    moneyFields.map((field) => [
      field,
      filteredStudents.reduce((sum, s) => sum + (s.financial?.[field] || 0), 0)
    ])
  );

  const reviewCount = students.filter((s) => s.reviewNote).length;

  const dialogStudent =
    dialogId && students.find((student) => student.id === dialogId);

  const cellStyle = {
    borderBottom: "1px solid #e2e8f0",
    padding: "8px 10px",
    textAlign: "right",
    whiteSpace: "nowrap",
    minWidth: "110px"
  };

  const headerStyle = {
    ...cellStyle,
    position: "sticky",
    top: 0,
    zIndex: 2,
    backgroundColor: "#eff6ff",
    color: "#1e40af",
    fontWeight: "bold"
  };

  const moneyStyle = {
    ...cellStyle,
    minWidth: "100px",
    textAlign: "left",
    fontVariantNumeric: "tabular-nums"
  };

  const pinned = (right, width) => ({
    position: "sticky",
    right,
    width,
    minWidth: width,
    maxWidth: width,
    boxSizing: "border-box"
  });

  const indexCellStyle = {
    ...cellStyle,
    ...pinned(0, INDEX_WIDTH),
    zIndex: 1,
    backgroundColor: "#ffffff",
    color: "#64748b"
  };

  const nameCellStyle = {
    ...cellStyle,
    ...pinned(INDEX_WIDTH, NAME_WIDTH),
    zIndex: 1,
    padding: "6px 10px",
    backgroundColor: "#ffffff",
    boxShadow: "-3px 0 4px -2px rgba(15, 23, 42, 0.12)"
  };

  const control = {
    padding: "9px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    backgroundColor: "#ffffff"
  };

  function renderCell(student, column) {
    if (column.kind === "parent") {
      return (
        <ParentLinkCell
          studentId={student.id}
          relation={column.relation}
          parent={student[column.field]}
          onChanged={reloadAfterFamilyChange}
          onEditingChange={editingChanged}
        />
      );
    }

    if (column.kind === "view") {
      return (
        <button
          type="button"
          onClick={() => setDialogId(student.id)}
          title="التعديل من نافذة بيانات الطفل"
          style={{ background: "none", border: "none", padding: "8px", cursor: "pointer", color: "inherit" }}
        >
          {column.value(student) || "—"}
        </button>
      );
    }

    return (
      <EditableCell
        studentId={student.id}
        field={column.field}
        type={column.type || "text"}
        value={displayValue(student, column.field)}
        updatedAt={student.updatedAt}
        onSaved={handleStudentSaved}
        onEditingChange={editingChanged}
      />
    );
  }

  function moneyCell(student, field) {
    const value = student.financial?.[field] || 0;
    const color =
      field === "remaining" && value > 0
        ? "#b91c1c"
        : field === "totalPaid" && value > 0
          ? "#15803d"
          : undefined;

    return (
      <td key={field} style={{ ...moneyStyle, color }}>
        {student.enrollment ? formatMoney(value) : "—"}
      </td>
    );
  }

  return (
    <main
      dir="rtl"
      lang="ar"
      style={{
        maxWidth: "100%",
        margin: "16px auto",
        padding: "0 20px"
      }}
    >
      <h1 style={{ color: "#1e40af", margin: "0 0 12px" }}>
        إدارة بيانات الأطفال
        {options.academicYear && (
          <span style={{ fontSize: "15px", color: "#64748b", fontWeight: "normal" }}>
            {" "}— السنة الدراسية {options.academicYear}
          </span>
        )}
      </h1>

      <form
        onSubmit={addStudent}
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          alignItems: "center",
          padding: "14px",
          marginBottom: "14px",
          backgroundColor: "#f8fafc",
          borderRadius: "12px"
        }}
      >
        <strong style={{ color: "#1e40af" }}>طفل جديد:</strong>

        {[
          ["firstName", "الاسم", true],
          ["fatherName", "اسم الأب", false],
          ["grandfatherName", "اسم الجد", false]
        ].map(([field, label, required]) => (
          <input
            key={field}
            aria-label={label}
            placeholder={label}
            value={form[field]}
            maxLength={100}
            required={required}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                [field]: event.target.value
              }))
            }
            style={{ ...control, width: "140px" }}
          />
        ))}

        <select
          aria-label="الشعبة"
          value={form.classId}
          onChange={(event) => setForm((previous) => ({ ...previous, classId: event.target.value }))}
          style={control}
        >
          <option value="">— الشعبة —</option>
          {options.classes.map((cls) => (
            <option key={cls.id} value={cls.id}>{classLabel(cls)}</option>
          ))}
        </select>

        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "9px 20px",
            backgroundColor: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "6px"
          }}
        >
          {saving ? "جارٍ التسجيل..." : "إضافة طفل"}
        </button>
      </form>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "10px" }}>
        <input
          aria-label="البحث عن طفل"
          placeholder="البحث بالاسم أو الرمز أو الهاتف أو السكن..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          style={{ ...control, flex: "1 1 260px", maxWidth: "420px" }}
        />

        <div role="group" aria-label="الفترة" style={{ display: "flex", gap: "4px" }}>
          {[["", "الكل"], ...Object.entries(SHIFTS)].map(([value, label]) => (
            <button
              key={value || "all"}
              type="button"
              aria-pressed={shift === value}
              onClick={() => { setShift(value); setClassId(""); }}
              style={{
                ...control,
                cursor: "pointer",
                backgroundColor: shift === value ? "#2563eb" : "#ffffff",
                color: shift === value ? "#ffffff" : "#1e293b",
                borderColor: shift === value ? "#2563eb" : "#cbd5e1"
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          aria-label="الشعبة"
          value={classId}
          onChange={(event) => setClassId(event.target.value)}
          style={control}
        >
          <option value="">كل الشعب</option>
          {shownClasses.map((cls) => (
            <option key={cls.id} value={String(cls.id)}>
              {classLabel(cls)}{cls.teacherName ? ` — ${cls.teacherName}` : ""}
            </option>
          ))}
        </select>

        {reviewCount > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: "6px", color: "#b45309", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={reviewOnly}
              onChange={(event) => setReviewOnly(event.target.checked)}
            />
            بحاجة إلى مراجعة ({reviewCount})
          </label>
        )}

        <span style={{ marginInlineStart: "auto", color: "#64748b", fontSize: "13px" }}>
          آخر تحديث:{" "}
          {lastSync ? lastSync.toLocaleTimeString("ar-IQ") : "بانتظار البيانات"}
        </span>
      </div>

      {error && (
        <p role="alert" style={{ color: "#dc2626" }}>
          {error}
        </p>
      )}

      {loading ? (
        <p>جارٍ تحميل البيانات...</p>
      ) : (
        <div
          style={{
            width: "100%",
            maxHeight: "calc(100vh - 250px)",
            overflow: "auto",
            border: "1px solid #e2e8f0",
            borderRadius: "10px"
          }}
        >
          <table
            style={{
              borderCollapse: "collapse",
              backgroundColor: "white",
              width: "max-content",
              minWidth: "100%"
            }}
          >
            <thead>
              <tr>
                <th style={{ ...headerStyle, ...pinned(0, INDEX_WIDTH), zIndex: 3 }}>ت</th>
                <th style={{ ...headerStyle, ...pinned(INDEX_WIDTH, NAME_WIDTH), zIndex: 3 }}>الطفل</th>
                {columns.map((column) => (
                  <th
                    key={column.field}
                    style={column.kind === "money" ? { ...headerStyle, textAlign: "left" } : headerStyle}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredStudents.map((student, index) => (
                <tr
                  key={student.id}
                  style={{ opacity: student.status === "ACTIVE" ? 1 : 0.55 }}
                >
                  <td style={indexCellStyle}>{index + 1}</td>

                  <td style={nameCellStyle}>
                    <button
                      type="button"
                      onClick={() => setDialogId(student.id)}
                      title={student.reviewNote ? `يحتاج مراجعة: ${student.reviewNote}` : "تعديل جميع بيانات الطفل"}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        width: "100%",
                        padding: 0,
                        background: "none",
                        border: "none",
                        font: "inherit",
                        color: "inherit",
                        textAlign: "right",
                        cursor: "pointer"
                      }}
                    >
                      <StudentPhoto student={student} />
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontWeight: 600
                        }}
                      >
                        {fullName(student)}
                      </span>
                      {student.reviewNote && (
                        <span aria-label="يحتاج مراجعة" style={{ color: "#d97706" }}>⚠</span>
                      )}
                    </button>
                  </td>

                  {columns.map((column) =>
                    column.kind === "money" ? (
                      moneyCell(student, column.field)
                    ) : (
                      <td key={column.field} style={cellStyle}>
                        {renderCell(student, column)}
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>

            {filteredStudents.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: "bold", backgroundColor: "#f8fafc" }}>
                  <td style={{ ...indexCellStyle, backgroundColor: "#f8fafc" }} />
                  <td style={{ ...nameCellStyle, backgroundColor: "#f8fafc" }}>
                    المجموع ({filteredStudents.length})
                  </td>
                  {columns.map((column) =>
                    column.kind === "money" ? (
                      <td key={column.field} style={moneyStyle}>{formatMoney(totals[column.field])}</td>
                    ) : (
                      <td key={column.field} style={cellStyle} />
                    )
                  )}
                </tr>
              </tfoot>
            )}
          </table>

          {filteredStudents.length === 0 && (
            <p style={{ padding: "20px" }}>
              لم يتم العثور على أطفال.
            </p>
          )}
        </div>
      )}

      {dialogStudent && (
        <StudentDialog
          key={dialogStudent.id}
          student={dialogStudent}
          options={options}
          onClose={() => setDialogId(null)}
          onSaved={handleStudentSaved}
          onFamilyChanged={reloadAfterFamilyChange}
          onEditingChange={editingChanged}
        />
      )}
    </main>
  );
}
