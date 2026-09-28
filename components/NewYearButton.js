
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { send } from "./StaffManager";

// بدء سنة دراسية جديدة (POST /api/academic-years).
export default function NewYearButton({ next, current }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function start() {
    const ok = window.confirm(
      `بدء السنة الدراسية ${next}؟\n\n` +
      `• تُنسخ شعب ${current} بمرشداتها إلى ${next}.\n` +
      "• ينتقل كل طفل نشط إلى نفس الشعبة بنفس المبلغ ونوع الدفع، من 1 تشرين الأول (الصباحي) أو 1 تشرين الثاني (المسائي).\n" +
      `• تبقى دفعات ${current} وديونها في سنتها، وتظهر في «المتأخرون».\n` +
      "• تُحفظ نسخة احتياطية أولاً.\n\nلا يمكن التراجع إلا باستعادة النسخة الاحتياطية."
    );
    if (!ok) return;

    setBusy(true);
    setMessage(null);
    try {
      const data = await send("/api/academic-years", "POST");
      setMessage({ ok: true, text: `✓ بدأت السنة ${data.name}: ${data.classes} شعبة، ${data.students} طفل.` });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
      <button type="button" disabled={busy} onClick={start}>
        {busy ? "جارٍ البدء..." : `+ بدء السنة الدراسية ${next}`}
      </button>
      {message && (
        <span role={message.ok ? "status" : "alert"} style={{ color: message.ok ? "#15803d" : "#dc2626" }}>
          {message.text}
        </span>
      )}
    </span>
  );
}
