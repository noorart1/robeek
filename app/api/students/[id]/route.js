
import prisma from "../../../../lib/prisma";
import { getCurrentUser } from "../../../../lib/auth";
import { toWesternDigits } from "../../../../lib/digits";
import { loadStudent } from "../../../../lib/student-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// فیلدهای مجاز برای ویرایش

const editableFields = [
  "studentCode",
  "firstName",
  "lastName",
  "fatherName",
  "grandfatherName",
  "nationalId",
  "birthDate",
  "birthYear",
  "gender",
  "phone",
  "address",
  "emergencyPhone",
  "notes",
  "reviewNote",
  "transportLineId",
  "status"
];

// فیلدهای الزامی

const requiredFields = [
  "studentCode",
  "firstName"
];

// محدودیت طول فیلدها

const fieldLimits = {
  studentCode: 50,
  firstName: 100,
  lastName: 100,
  fatherName: 100,
  grandfatherName: 100,
  nationalId: 30,
  birthDate: 10,
  birthYear: 4,
  gender: 30,
  phone: 30,
  address: 500,
  emergencyPhone: 30,
  notes: 500,
  reviewNote: 1000,
  transportLineId: 12,
  status: 30
};

// فیلدهایی که می‌توانند خالی باشند

const nullableFields = [
  "lastName",
  "fatherName",
  "grandfatherName",
  "nationalId",
  "birthDate",
  "birthYear",
  "reviewNote",
  "transportLineId",
  "gender",
  "phone",
  "address",
  "emergencyPhone",
  "notes"
];

// Fields where Arabic-Indic digits are accepted and stored as ASCII
const digitFields = [
  "studentCode",
  "birthYear",
  "nationalId",
  "phone",
  "emergencyPhone"
];

// پاسخ خطا

function errorResponse(message, status, extra = {}) {
  return Response.json(
    {
      error: message,
      ...extra
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

// بررسی صحت تاریخ تولد میلادی

function parseBirthDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(
    value + "T00:00:00.000Z"
  );

  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  // جلوگیری از پذیرش تاریخ نامعتبر

  if (date.toISOString().slice(0, 10) !== value) {
    return null;
  }

  // تاریخ تولد نمی‌تواند در آینده باشد

  const today = new Date();

  const todayUTC = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );

  if (date.getTime() > todayUTC) {
    return null;
  }

  return date;
}

// Validate one field; returns { value } ready to store, or { error }

function validateField(field, value) {
  // بررسی فیلد انتخاب‌شده

  if (
    typeof field !== "string" ||
    !editableFields.includes(field)
  ) {
    return { error: "الحقل المحدد غير قابل للتعديل." };
  }

  // بررسی مقدار واردشده

  if (
    typeof value !== "string" ||
    value.length > fieldLimits[field]
  ) {
    return { error: "القيمة المدخلة غير صالحة." };
  }

  const trimmedValue = digitFields.includes(field)
    ? toWesternDigits(value.trim())
    : value.trim();

  // بررسی فیلدهای الزامی

  if (
    requiredFields.includes(field) &&
    !trimmedValue
  ) {
    return { error: "هذا الحقل مطلوب ولا يمكن تركه فارغاً." };
  }

  // آماده‌سازی مقدار جدید

  let newValue = trimmedValue;

  // تاریخ تولد میلادی

  if (field === "birthDate") {
    if (!trimmedValue) {
      newValue = null;
    } else {
      const parsedDate = parseBirthDate(
        trimmedValue
      );

      if (!parsedDate) {
        return { error: "يرجى إدخال تاريخ ميلاد ميلادي صحيح." };
      }

      newValue = parsedDate;
    }
  }

  // شماره ملی عراق

  if (
    field === "nationalId" &&
    trimmedValue
  ) {
    if (!/^[0-9]{1,30}$/.test(trimmedValue)) {
      return { error: "يرجى إدخال الرقم الوطني بالأرقام فقط." };
    }
  }

  // شماره‌های تماس

  if (
    ["phone", "emergencyPhone"].includes(field) &&
    trimmedValue
  ) {
    if (
      !/^[+]?[0-9\s()-]{7,30}$/.test(trimmedValue)
    ) {
      return { error: "يرجى إدخال رقم هاتف صحيح." };
    }
  }

  // سنة الميلاد (المواليد) — the only birth information many families give

  if (field === "birthYear" && trimmedValue) {
    const year = Number(trimmedValue);

    if (
      !/^\d{4}$/.test(trimmedValue) ||
      year < 2000 ||
      year > new Date().getUTCFullYear()
    ) {
      return { error: "يرجى إدخال سنة ميلاد صحيحة." };
    }

    newValue = year;
  }

  // خط النقل (existence is enforced by the foreign key)

  if (field === "transportLineId" && trimmedValue) {
    const lineId = Number(trimmedValue);

    if (!Number.isSafeInteger(lineId) || lineId <= 0) {
      return { error: "خط النقل المحدد غير صالح." };
    }

    newValue = lineId;
  }

  // جنسیت کودک

  if (field === "gender" && trimmedValue) {
    if (
      !["MALE", "FEMALE"].includes(trimmedValue)
    ) {
      return { error: "يرجى اختيار الجنس من القائمة." };
    }
  }

  // وضعیت کودک

  if (field === "status") {
    if (
      !["ACTIVE", "INACTIVE"].includes(trimmedValue)
    ) {
      return { error: "حالة الطفل غير صالحة." };
    }
  }

  // تبدیل فیلدهای اختیاری خالی به null

  if (
    nullableFields.includes(field) &&
    !trimmedValue
  ) {
    newValue = null;
  }

  return { value: newValue };
}

// ویرایش اطلاعات کودک

export async function PATCH(request, { params }) {
  try {

    // بررسی نشست مدیر

    const user = await getCurrentUser();

    if (!user || user.role !== "ADMIN") {
      return errorResponse(
        "ليس لديك صلاحية الوصول.",
        401
      );
    }

    // بررسی شناسه کودک

    const { id } = await params;

    const studentId = Number(id);

    if (
      !Number.isSafeInteger(studentId) ||
      studentId <= 0
    ) {
      return errorResponse(
        "معرّف الطفل غير صالح.",
        400
      );
    }

    // دریافت اطلاعات ارسالی

    let body;

    try {
      body = await request.json();
    } catch {
      return errorResponse(
        "البيانات المرسلة غير صالحة.",
        400
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return errorResponse(
        "البيانات المرسلة غير صالحة.",
        400
      );
    }

    const { updatedAt } = body;

    // A cell edit sends { field, value }; the full edit dialog sends
    // { fields: { name: value, ... } }. Both are validated identically
    // and saved in one conditional update.

    const changes =
      body.fields &&
      typeof body.fields === "object" &&
      !Array.isArray(body.fields)
        ? body.fields
        : { [body.field]: body.value };

    const entries = Object.entries(changes);

    if (entries.length === 0) {
      return errorResponse(
        "لا توجد تغييرات للحفظ.",
        400
      );
    }

    const data = {};

    for (const [field, value] of entries) {
      const checked = validateField(field, value);

      if (checked.error) {
        return errorResponse(checked.error, 400, { field });
      }

      data[field] = checked.value;
    }

    // بررسی نسخه اطلاعات برای جلوگیری از تداخل

    if (
      typeof updatedAt !== "string" ||
      !Number.isFinite(Date.parse(updatedAt))
    ) {
      return errorResponse(
        "إصدار البيانات غير صالح. يرجى تحديث الجدول.",
        400
      );
    }

    const expectedUpdatedAt = new Date(updatedAt);

    // ذخیره مشروط اطلاعات

    const result = await prisma.student.updateMany({
      where: {
        id: studentId,
        updatedAt: expectedUpdatedAt
      },
      data: {
        ...data,
        updatedAt: new Date()
      }
    });

    // بررسی تداخل ویرایش

    if (result.count === 0) {
      const currentStudent = await loadStudent(studentId);

      if (!currentStudent) {
        return errorResponse(
          "لم يتم العثور على الطفل المطلوب.",
          404
        );
      }

      return errorResponse(
        "تم تعديل بيانات هذا الطفل. يرجى تحديث الجدول قبل حفظ التغييرات.",
        409,
        {
          code: "EDIT_CONFLICT",
          student: currentStudent
        }
      );
    }

    // دریافت اطلاعات ذخیره‌شده

    const student = await loadStudent(studentId);

    return Response.json(
      {
        success: true,
        student
      },
      {
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );

  } catch (error) {

    // جلوگیری از ثبت اطلاعات تکراری

    if (error.code === "P2002") {
      return errorResponse(
        "هذه القيمة مسجلة مسبقاً لطفل آخر.",
        409
      );
    }

    // Foreign key: the chosen transport line does not exist
    if (error.code === "P2003") {
      return errorResponse(
        "خط النقل المحدد غير موجود.",
        400,
        { field: "transportLineId" }
      );
    }

    console.error("Student PATCH error:", error);

    return errorResponse(
      "حدث خطأ أثناء حفظ بيانات الطفل.",
      500
    );
  }
}