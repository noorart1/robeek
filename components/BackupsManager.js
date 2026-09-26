"use client";

import { useEffect, useState } from "react";
import { redirectIfSignedOut, SESSION_EXPIRED } from "./session";

const KINDS = { db: "قاعدة البيانات", photos: "صور الأطفال" };

const TAGS = {
  "": "تلقائية (ليلية)",
  manual: "يدوية",
  upload: "مرفوعة",
  "pre-restore": "قبل الاستعادة"
};

// db-2026-09-26_151200-manual-2.sql.gz → { kind: "db", tag: "manual" }
function describe(name) {
  const [, kind, tag = ""] = /^(db|photos)-[\d_-]+?(?:-([a-z][a-z-]*))?(?:-\d+)?\.(?:sql|tar)\.gz$/.exec(name) || [];
  return { kind: KINDS[kind] || kind, tag: TAGS[tag] ?? tag };
}

const when = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Baghdad",
  dateStyle: "short",
  timeStyle: "short"
});

function size(bytes) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function send(url, method, body) {
  const response = await fetch(url, { method, body, cache: "no-store" });

  if (redirectIfSignedOut(response)) throw new Error(SESSION_EXPIRED);

  const data = await response.json();

  if (!response.ok) throw new Error(data.error || "تعذر تنفيذ العملية.");

  return data;
}

const button = {
  padding: "8px 14px",
  border: "none",
  borderRadius: "6px",
  backgroundColor: "#2563eb",
  color: "#ffffff",
  cursor: "pointer"
};

export default function BackupsManager() {
  const [backups, setBackups] = useState([]);
  const [busy, setBusy] = useState(""); // what is running, shown to the user
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function run(label, task) {
    setBusy(label);
    setError("");
    setMessage("");
    try {
      const data = await task();
      if (data.backups) setBackups(data.backups);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    run("جارٍ التحميل…", () => send("/api/backups", "GET"));
  }, []);

  async function backupNow() {
    const data = await run("جارٍ إنشاء النسخة…", () => send("/api/backups", "POST"));
    if (data) setMessage("تم إنشاء النسخة الاحتياطية. يمكنك تنزيلها من القائمة أدناه.");
  }

  async function upload(event) {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;

    const data = await run("جارٍ رفع الملف…", () => send("/api/backups", "PUT", file));
    if (data) setMessage("تم رفع الملف. لاستعادته اضغط «استعادة» بجانبه في القائمة.");
  }

  async function restore(item) {
    const { kind } = describe(item.name);
    const isDb = item.name.startsWith("db-");

    const warning = isDb
      ? "سيتم استبدال كل البيانات الحالية (الأطفال، الدفعات، الحضور، المستخدمون…) بهذه النسخة. " +
        "كل ما أُدخل بعد تاريخها سيُفقد (وأرقام الوصولات الصادرة بعده ستُستخدم من جديد)، " +
        "وقد تحتاج إلى تسجيل الدخول من جديد.\n\n" +
        "تُحفظ البيانات الحالية تلقائياً أولاً في نسخة «قبل الاستعادة».\n\nهل تريد المتابعة؟"
      : "ستُضاف صور هذه النسخة وتُستبدل الصور التي تحمل الاسم نفسه. الصور الأحدث تبقى.\n\nهل تريد المتابعة؟";

    if (!window.confirm(`استعادة ${kind} من ${when.format(new Date(item.createdAt))}\n\n${warning}`)) return;

    const data = await run("جارٍ الاستعادة… لا تغلق الصفحة", () =>
      send(`/api/backups/${encodeURIComponent(item.name)}`, "POST")
    );

    if (data) {
      setMessage("تمت الاستعادة بنجاح. البيانات السابقة محفوظة في نسخة «قبل الاستعادة».");
      // The restored database has its own sessions table; this checks the
      // session still exists and sends the user to the login page if not.
      if (isDb) send("/api/backups", "GET").catch(() => {});
    }
  }

  const cell = { padding: "10px", borderBottom: "1px solid #e2e8f0", textAlign: "right" };

  return (
    <main style={{ maxWidth: "1000px", margin: "24px auto", padding: "0 20px" }}>
      <h1 style={{ color: "#1e40af", marginBottom: "4px" }}>النسخ الاحتياطي</h1>
      <p style={{ color: "#64748b", marginTop: 0 }}>
        تُنشأ نسخة تلقائياً كل ليلة وتُحفظ ٣٠ يوماً على الخادم. نزّل نسخة بين حين وآخر
        واحفظها على جهازك أو فلاشة، فإن تعطل الخادم يمكنك رفعها هنا واستعادتها.
        الملفات تحتوي بيانات الأطفال الشخصية: احفظها في مكان آمن.
      </p>

      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", margin: "16px 0" }}>
        <button type="button" style={button} disabled={Boolean(busy)} onClick={backupNow}>
          إنشاء نسخة احتياطية الآن
        </button>

        <label style={{ ...button, backgroundColor: "#475569", opacity: busy ? 0.6 : 1 }}>
          رفع نسخة من الجهاز…
          <input
            type="file"
            accept=".gz"
            disabled={Boolean(busy)}
            onChange={upload}
            style={{ display: "none" }}
          />
        </label>

        {busy && <span role="status" style={{ color: "#1e40af" }}>{busy}</span>}
      </div>

      {message && <p role="status" style={{ color: "#15803d" }}>{message}</p>}
      {error && <p role="alert" style={{ color: "#dc2626" }}>{error}</p>}

      <table style={{ width: "100%", borderCollapse: "collapse", backgroundColor: "#ffffff" }}>
        <thead>
          <tr style={{ backgroundColor: "#f1f5f9" }}>
            <th style={cell}>التاريخ (بتوقيت العراق)</th>
            <th style={cell}>المحتوى</th>
            <th style={cell}>النوع</th>
            <th style={cell}>الحجم</th>
            <th style={cell}></th>
          </tr>
        </thead>
        <tbody>
          {backups.map((item) => {
            const { kind, tag } = describe(item.name);
            return (
              <tr key={item.name}>
                <td style={cell} dir="ltr">{when.format(new Date(item.createdAt))}</td>
                <td style={cell}>{kind}</td>
                <td style={cell}>{tag}</td>
                <td style={cell} dir="ltr">{size(item.size)}</td>
                <td style={{ ...cell, whiteSpace: "nowrap" }}>
                  <a href={`/api/backups/${encodeURIComponent(item.name)}`} download style={{ color: "#2563eb" }}>
                    تنزيل
                  </a>
                  {" · "}
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => restore(item)}
                    style={{ border: "none", background: "none", color: "#dc2626", cursor: "pointer", padding: 0 }}
                  >
                    استعادة
                  </button>
                </td>
              </tr>
            );
          })}
          {!backups.length && !busy && (
            <tr>
              <td style={cell} colSpan={5}>لا توجد نسخ احتياطية بعد.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
