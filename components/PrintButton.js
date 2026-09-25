
"use client";

export default function PrintButton({ label = "🖨 طباعة" }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{
        padding: "10px 24px",
        backgroundColor: "#2563eb",
        color: "#ffffff",
        border: "none",
        borderRadius: "8px",
        cursor: "pointer"
      }}
    >
      {label}
    </button>
  );
}
