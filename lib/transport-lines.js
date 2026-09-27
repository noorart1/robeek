
import { toWesternDigits } from "./digits.js";
import { SHIFTS } from "./labels.js";

// Validate a transport line from a request body. With `partial`, only the
// fields present are checked (PATCH); otherwise the name is required.
// Returns { data } ready for Prisma, or { error, field }.

export function validateLine(body, { partial = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "البيانات المرسلة غير صالحة." };
  }

  const data = {};

  if (!partial || "name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";

    if (!name || name.length > 100) {
      return { error: "يرجى إدخال اسم السائق.", field: "name" };
    }

    data.name = name;
  }

  if ("driverPhone" in body) {
    const phone =
      typeof body.driverPhone === "string"
        ? toWesternDigits(body.driverPhone.trim())
        : "";

    if (phone && !/^[+]?[0-9\s()-]{7,30}$/.test(phone)) {
      return { error: "رقم هاتف السائق غير صالح.", field: "driverPhone" };
    }

    data.driverPhone = phone || null;
  }

  if (!partial || "shift" in body) {
    const shift = body.shift ?? "MORNING";

    if (!(shift in SHIFTS)) {
      return { error: "الفترة غير صالحة.", field: "shift" };
    }

    data.shift = shift;
  }

  return { data };
}

// A line's riders in pickup order: { studentIds: [3, 1, 7] }.
// Returns { studentIds } or { error }.

export function validateRiders(body) {
  const ids = body?.studentIds;

  if (
    !Array.isArray(ids) ||
    ids.length > 500 ||
    !ids.every((id) => Number.isSafeInteger(id) && id > 0) ||
    new Set(ids).size !== ids.length
  ) {
    return { error: "قائمة الأطفال غير صالحة." };
  }

  return { studentIds: ids };
}
