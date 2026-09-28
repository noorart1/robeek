
// الكادر والرواتب: validation shared by the API routes (and the tests).
// Each check returns { data } ready for Prisma, or { error, field }.

import { parseAmount, toWesternDigits } from "./digits.js";
import { parseDay } from "./dates.js";
import { PAYMENT_METHODS, SHIFTS } from "./labels.js";

// Suggestions only: the school's titles vary («معلمة تمهيدي - صباحي»,
// «مسؤلة ميديا»…), so الوظيفة is free text.
export const JOB_SUGGESTIONS = [
  "المدير", "المعاون الإداري", "معاونة إدارية", "مساعد معاون",
  "معلمة روضة", "معلمة تمهيدي", "مساعدة", "مسؤلة أنشطة", "مسؤلة ميديا",
  "عاملة", "اداري"
];

export const CONTRACT_SUGGESTIONS = ["نعم", "لا"];

const text = (value, max) => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.slice(0, max) : null;
};

const optionalAmount = (value) =>
  value === null || value === undefined || String(value).trim() === "" ? null : parseAmount(value);

const optionalDay = (value) => (value ? parseDay(toWesternDigits(String(value))) : null);

export function checkStaff(body) {
  const name = text(body.name, 191);
  if (!name) return { error: "يرجى إدخال الاسم.", field: "name" };

  const phone = text(toWesternDigits(String(body.phone ?? "")), 30);
  if (phone && !/^[+]?[0-9\s()-]{7,30}$/.test(phone)) {
    return { error: "يرجى إدخال رقم هاتف صحيح.", field: "phone" };
  }

  const shift = body.shift || null;
  if (shift && !(shift in SHIFTS)) return { error: "أوقات الدوام غير صالحة.", field: "shift" };

  const data = {
    name,
    phone,
    shift,
    address: text(body.address, 500),
    education: text(body.education, 191),
    job: text(body.job, 191),
    contract: text(body.contract, 191),
    notes: text(body.notes, 5000),
    isActive: body.isActive !== false
  };

  for (const field of ["baseSalary", "bonus"]) {
    const amount = optionalAmount(body[field]);
    if (body[field] && String(body[field]).trim() && amount === null) {
      return { error: "يرجى إدخال المبلغ بالأرقام.", field };
    }
    data[field] = amount;
  }

  for (const field of ["birthDate", "startDate"]) {
    const day = optionalDay(body[field]);
    if (body[field] && !day) return { error: "التاريخ غير صالح.", field };
    data[field] = day;
  }

  return { data };
}

export const isMonth = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value));

export function checkSalary(body) {
  const staffId = Number(body.staffId);
  if (!Number.isSafeInteger(staffId) || staffId <= 0) return { error: "الموظف غير صالح.", field: "staffId" };
  if (!isMonth(body.month)) return { error: "الشهر غير صالح.", field: "month" };

  const baseSalary = parseAmount(body.baseSalary);
  if (baseSalary === null) return { error: "يرجى إدخال الراتب بالأرقام.", field: "baseSalary" };

  const data = { staffId, month: body.month, baseSalary };

  for (const field of ["bonus", "deduction"]) {
    const amount = optionalAmount(body[field]);
    if (body[field] && String(body[field]).trim() && amount === null) {
      return { error: "يرجى إدخال المبلغ بالأرقام.", field };
    }
    data[field] = amount ?? 0;
  }

  if (netSalary(data) < 0) return { error: "الخصومات أكبر من الراتب.", field: "deduction" };

  const paidOn = optionalDay(body.paidOn);
  if (body.paidOn && !paidOn) return { error: "تاريخ الدفع غير صالح.", field: "paidOn" };

  const paymentMethod = body.paymentMethod || null;
  if (paymentMethod && !(paymentMethod in PAYMENT_METHODS)) {
    return { error: "نوع الدفع غير صالح.", field: "paymentMethod" };
  }

  return { data: { ...data, paidOn, paymentMethod, notes: text(body.notes, 500) } };
}

// الصافي = الراتب + المكافآت − الخصومات
export const netSalary = ({ baseSalary, bonus, deduction }) =>
  Number(baseSalary) + Number(bonus || 0) - Number(deduction || 0);

// Prisma rows → JSON: Decimals as numbers, dates as "YYYY-MM-DD".
const money = (value) => (value === null ? null : Number(value));
const day = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

export const formatStaff = (s) => ({
  ...s,
  baseSalary: money(s.baseSalary),
  bonus: money(s.bonus),
  birthDate: day(s.birthDate),
  startDate: day(s.startDate)
});

export const formatSalary = (s) => ({
  ...s,
  baseSalary: money(s.baseSalary),
  bonus: money(s.bonus),
  deduction: money(s.deduction),
  paidOn: day(s.paidOn),
  net: netSalary(s)
});
