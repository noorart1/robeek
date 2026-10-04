
import prisma from "./prisma";
import { parseFinanceAccess } from "./finance-access";
export { checkFinanceAccess } from "./finance-access";

// Shared by /api/users and /api/users/[id]: validation of account fields
// and keeping section assignments (Class.teacherUserId) in step.

export const MIN_PASSWORD = 12;
export const ASSIGNABLE_ROLES = ["ADMIN", "DEPUTY", "TEACHER"];

export const userSelect = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  isActive: true,
  createdAt: true,
  staffId: true,
  financeAccess: true,
  Class: {
    select: { id: true, name: true, shift: true },
    orderBy: [{ shift: "desc" }, { name: "asc" }]
  }
};

export function formatUser({ Class, financeAccess, ...user }) {
  return { ...user, classes: Class, financeAccess: parseFinanceAccess(financeAccess) };
}

// Each check returns { value } or { error, field }.

export function checkUsername(value) {
  const username = typeof value === "string" ? value.trim() : "";

  // Latin letters and digits: easy to type on any phone keyboard.
  if (!/^[A-Za-z0-9._-]{3,50}$/.test(username)) {
    return {
      error: "اسم المستخدم من 3 إلى 50 حرفاً: أحرف إنجليزية أو أرقام أو . _ -",
      field: "username"
    };
  }

  return { value: username };
}

export function checkFullName(value) {
  const fullName = typeof value === "string" ? value.trim() : "";

  if (!fullName || fullName.length > 100) {
    return { error: "يرجى إدخال الاسم الكامل.", field: "fullName" };
  }

  return { value: fullName };
}

export function checkPassword(value) {
  if (typeof value !== "string" || value.length < MIN_PASSWORD || value.length > 1024) {
    return {
      error: `يجب أن تتكون كلمة المرور من ${MIN_PASSWORD} حرفاً على الأقل.`,
      field: "password"
    };
  }

  return { value };
}

export function checkRole(value) {
  if (!ASSIGNABLE_ROLES.includes(value)) {
    return { error: "الصلاحية غير صالحة.", field: "role" };
  }

  return { value };
}

export function checkClassIds(value) {
  if (value === undefined) return { value: undefined };

  if (
    !Array.isArray(value) ||
    value.length > 50 ||
    !value.every((id) => Number.isSafeInteger(Number(id)) && Number(id) > 0)
  ) {
    return { error: "الشعب المحددة غير صالحة.", field: "classIds" };
  }

  return { value: [...new Set(value.map(Number))] };
}

// Make `classIds` exactly the sections this user teaches. Sections taken
// from another teacher move to this one; the displayed teacher name
// follows the account's name. With `staffId` (the account is linked to
// her row in الكادر) the sections are linked to that row too, and the
// ones she gives up lose her as their teacher.
export async function assignClasses(tx, userId, fullName, classIds, staffId = null) {
  await tx.class.updateMany({
    where: { teacherUserId: userId, id: { notIn: classIds } },
    data: { teacherUserId: null, ...(staffId ? { staffId: null, teacherName: null } : {}) }
  });

  if (classIds.length > 0) {
    const found = await tx.class.count({ where: { id: { in: classIds } } });

    if (found !== classIds.length) {
      throw Object.assign(new Error("class"), { code: "NO_CLASS" });
    }

    await tx.class.updateMany({
      where: { id: { in: classIds } },
      data: { teacherUserId: userId, teacherName: fullName, staffId }
    });
  }
}

// `staffId` from a request: { value } (null unlinks) or { error, field }.
export async function checkStaffId(tx, value) {
  if (value === undefined) return { value: undefined };
  if (value === null || value === "") return { value: null };

  const id = Number(value);
  const staff = Number.isSafeInteger(id) && id > 0
    ? await tx.staff.findUnique({ where: { id }, select: { id: true, name: true } })
    : null;

  return staff ? { value: staff.id, staff } : { error: "الموظف المحدد غير موجود.", field: "staffId" };
}

// A section's المرشدة chosen from الكادر (null: none). Her name is shown,
// and her account, if she has a teacher's one, records its attendance.
export async function setClassTeacher(tx, classId, staffId) {
  const staff = staffId
    ? await tx.staff.findUnique({ where: { id: staffId }, select: { name: true, User: { select: { id: true, role: true } } } })
    : null;

  return tx.class.update({
    where: { id: classId },
    data: {
      staffId: staff ? staffId : null,
      teacherName: staff?.name ?? null,
      teacherUserId: staff?.User?.role === "TEACHER" ? staff.User.id : null
    },
    select: { id: true, name: true, shift: true, teacherName: true, staffId: true }
  });
}

// Renamed in الكادر: her account and her sections show the new name.
// Queries for a $transaction([...]).
export function renameStaff(client, staffId, name) {
  return [
    client.user.updateMany({ where: { staffId }, data: { fullName: name, updatedAt: new Date() } }),
    client.class.updateMany({ where: { staffId }, data: { teacherName: name } })
  ];
}

export async function otherActiveAdmins(tx, userId) {
  return tx.user.count({
    where: { role: "ADMIN", isActive: true, id: { not: userId } }
  });
}

export function errorResponse(message, status, extra = {}) {
  return Response.json(
    { error: message, ...extra },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

export async function loadUser(id) {
  const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
  return user ? formatUser(user) : null;
}
