// Props for a modal <dialog>: a click on the dimmed backdrop outside the
// window calls `close`. Judged by position, not target (the window's own
// scrollbar is the dialog element too), and only when the press also
// began outside, so selecting text and releasing outside does not close it.

const outside = (event) => {
  const box = event.currentTarget.getBoundingClientRect();
  return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
};

export function closeOnBackdrop(close) {
  return {
    onMouseDown: (event) => { event.currentTarget.dataset.backdrop = outside(event) ? "1" : ""; },
    onClick: (event) => {
      if (event.currentTarget.dataset.backdrop === "1" && outside(event)) close();
    }
  };
}

// «Close without saving?» under `title` («تعديل: …»), listing each unsaved
// change as "• label: «before» ← «after»" from [label, before, after] rows.
export function confirmDiscard(title, changes, extra = []) {
  const shown = (value) => {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    return text ? `«${text.length > 40 ? text.slice(0, 40) + "…" : text}»` : "(فارغ)";
  };
  const lines = [
    ...changes.map(([label, before, after]) => `• ${label}: ${shown(before)} ← ${shown(after)}`),
    ...extra.map((line) => `• ${line}`)
  ];

  return window.confirm(
    `${title ? `${title}\n\n` : ""}هل تريد إغلاق النافذة دون حفظ التغييرات؟${lines.length ? `\n\n${lines.join("\n")}` : ""}`
  );
}
