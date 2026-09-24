
"use client";

import { useEffect, useRef, useState } from "react";
import EditableCell from "./EditableCell";
import ParentLinkCell from "./ParentLinkCell";

const columns = [
  { field: "studentCode", label: "رمز الطفل" },
  { field: "firstName", label: "الاسم" },
  { field: "lastName", label: "اللقب" },
  { field: "father", label: "الأب", kind: "parent", relation: "FATHER" },
  { field: "mother", label: "الأم", kind: "parent", relation: "MOTHER" },
  { field: "nationalId", label: "الرقم الوطني" },
  { field: "birthDate", label: "تاريخ الميلاد", type: "date" },
  { field: "gender", label: "الجنس", type: "gender" },
  { field: "phone", label: "رقم الهاتف" },
  { field: "emergencyPhone", label: "هاتف الطوارئ" },
  { field: "address", label: "عنوان السكن" },
  { field: "notes", label: "ملاحظات" },
  { field: "status", label: "الحالة", type: "status" }
];

function displayValue(student, field) {
  const value = student[field];

  if (field === "birthDate") {
    return value ? String(value).slice(0, 10) : "";
  }

  return value ?? "";
}

export default function StudentsTable() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [lastSync, setLastSync] = useState(null);

  const [form, setForm] = useState({
    studentCode: "",
    firstName: "",
    lastName: ""
  });

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
        const data = await fetchStudents();

        if (!active) return;

        setStudents(data);
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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "تعذر تسجيل الطفل."
        );
      }

      setStudents((previous) => [
        data.student,
        ...previous.filter(
          (student) => student.id !== data.student.id
        )
      ]);

      setForm({
        studentCode: "",
        firstName: "",
        lastName: ""
      });

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

  const filteredStudents = students.filter((student) => {
    const text = columns
      .map(({ field, kind }) => kind === "parent" ? [student[field]?.firstName, student[field]?.lastName, student[field]?.phone].join(" ") : displayValue(student, field))
      .join(" ")
      .toLowerCase();

    return text.includes(search.trim().toLowerCase());
  });

  const cellStyle = {
    borderBottom: "1px solid #e2e8f0",
    padding: "10px",
    textAlign: "right",
    whiteSpace: "nowrap",
    minWidth: "120px"
  };

  const headerStyle = {
    ...cellStyle,
    backgroundColor: "#eff6ff",
    color: "#1e40af",
    fontWeight: "bold"
  };

  return (
    <main
      dir="rtl"
      lang="ar"
      style={{
        maxWidth: "100%",
        margin: "20px auto",
        padding: "20px",
        fontFamily: "Tahoma, sans-serif"
      }}
    >
      <h1 style={{ color: "#1e40af" }}>
        إدارة بيانات الأطفال
      </h1>

      <p style={{ color: "#64748b" }}>
        تسجيل الأطفال وتعديل بياناتهم مباشرة
      </p>

      <form
        onSubmit={addStudent}
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          padding: "20px",
          marginBottom: "20px",
          backgroundColor: "#f8fafc",
          borderRadius: "12px"
        }}
      >
        {[
          ["studentCode", "رمز الطفل", 50],
          ["firstName", "الاسم", 100],
          ["lastName", "اللقب", 100]
        ].map(([field, label, limit]) => (
          <input
            key={field}
            aria-label={label}
            placeholder={label}
            value={form[field]}
            maxLength={limit}
            required
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                [field]: event.target.value
              }))
            }
            style={{
              padding: "10px",
              border: "1px solid #cbd5e1",
              borderRadius: "6px"
            }}
          />
        ))}

        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "10px 20px",
            backgroundColor: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "6px"
          }}
        >
          {saving ? "جارٍ التسجيل..." : "إضافة طفل"}
        </button>
      </form>

      <input
        aria-label="البحث عن طفل"
        placeholder="البحث عن طفل..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        style={{
          width: "100%",
          maxWidth: "450px",
          padding: "12px",
          boxSizing: "border-box",
          border: "1px solid #cbd5e1",
          borderRadius: "8px",
          marginBottom: "15px"
        }}
      />

      <p style={{ color: "#64748b" }}>
        آخر تحديث:{" "}
        {lastSync
          ? lastSync.toLocaleTimeString("ar-IQ")
          : "بانتظار البيانات"}
      </p>

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
            overflowX: "auto",
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
                <th style={headerStyle}>ت</th>

                {columns.map((column) => (
                  <th
                    key={column.field}
                    style={headerStyle}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredStudents.map((student, index) => (
                <tr key={student.id}>
                  <td style={cellStyle}>{index + 1}</td>

                  {columns.map((column) => (
                    <td
                      key={column.field}
                      style={cellStyle}
                    >
                      {column.kind === "parent" ? (
                        <ParentLinkCell
                          studentId={student.id}
                          relation={column.relation}
                          parent={student[column.field]}
                          onChanged={reloadAfterFamilyChange}
                          onEditingChange={editingChanged}
                        />
                      ) : (
                      <EditableCell
                        studentId={student.id}
                        field={column.field}
                        type={column.type || "text"}
                        value={displayValue(
                          student,
                          column.field
                        )}
                        updatedAt={student.updatedAt}
                        onSaved={handleStudentSaved}
                        onEditingChange={editingChanged}
                      />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {filteredStudents.length === 0 && (
            <p style={{ padding: "20px" }}>
              لم يتم العثور على أطفال.
            </p>
          )}
        </div>
      )}

      <p style={{ color: "#64748b" }}>
        عدد الأطفال المعروضين: {filteredStudents.length}
      </p>
    </main>
  );
}