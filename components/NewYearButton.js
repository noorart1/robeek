
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { send } from "./StaffManager";
import { yearLabel } from "../lib/labels";

// بدء سنة دراسية جديدة (POST /api/academic-years), or with `summer` (its
// name, «صيف 2026») بدء الدورة الصيفية. `locked` (why it cannot be started
// yet): shown, but disabled.
export default function NewYearButton({ next, current, summer, locked }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function start() {
    const ok = summer ? window.confirm(
      `بدء ${yearLabel(summer)}؟\n\n` +
      `• تُنسخ شعب ${current} بمرشداتها إلى الدورة الصيفية.\n` +
      "• لا يُسجَّل أي طفل تلقائياً: سجّل كل طفل من نافذته أو أضف طفلاً جديداً من «الدورة الصيفية».\n" +
      "• تبقى السنة الدراسية نشطة كما هي.\n• تُحفظ نسخة احتياطية أولاً."
    ) : window.confirm(
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
      const data = await send("/api/academic-years", "POST", summer ? { kind: "SUMMER" } : undefined);
      setMessage({
        ok: true,
        text: summer
          ? `✓ بدأت ${yearLabel(data.name)}: ${data.classes} شعبة.`
          : `✓ بدأت السنة ${data.name}: ${data.classes} شعبة، ${data.students} طفل.`
      });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
      <button type="button" disabled={busy || !!locked} onClick={start}>
        {busy ? "جارٍ البدء..." : summer ? `+ بدء ${yearLabel(summer)}` : `+ بدء السنة الدراسية ${next}`}
      </button>
      {locked && <span style={{ color: "#64748b", fontSize: "13px" }}>({locked})</span>}
      {message && (
        <span role={message.ok ? "status" : "alert"} style={{ color: message.ok ? "#15803d" : "#dc2626" }}>
          {message.text}
        </span>
      )}
    </span>
  );
}
