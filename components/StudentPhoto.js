
"use client";

// The photo URL includes the stored file name, which changes on every
// upload, so the browser can cache each version indefinitely.

export function photoUrl(student) {
  return `/api/students/${student.id}/photo?v=${encodeURIComponent(student.photo)}`;
}

export default function StudentPhoto({ student, size = 36 }) {
  const box = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0
  };

  if (student.photo) {
    return (
      <img
        src={photoUrl(student)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        style={{ ...box, objectFit: "cover", backgroundColor: "#e2e8f0" }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{
        ...box,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#dbeafe",
        color: "#1e40af",
        fontWeight: "bold",
        fontSize: size * 0.45
      }}
    >
      {(student.firstName || "?").trim().charAt(0)}
    </span>
  );
}

// Shrink a picked image (phone photos are often 3–8 MB) to at most
// `maxSize` px on its longer side and re-encode it as JPEG, which is the
// only format the server accepts.

export async function toJpeg(file, maxSize = 600, quality = 0.85) {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");

  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext("2d");

  // Transparent PNG areas would otherwise turn black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))),
      "image/jpeg",
      quality
    );
  });
}
