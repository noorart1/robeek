
import prisma from "../../../lib/prisma";
import { getCurrentUser } from "../../../lib/auth";
import { ATTENDANCE_STATUSES } from "../../../lib/labels";
import { dayString, iraqToday, parseDay } from "../../../lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RANGE_DAYS = 62;

function errorResponse(message, status) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

// Admins take attendance for any section; a teacher only for the sections
// assigned to her (Class.teacherUserId). Returns the user, or null.
async function attendanceUser() {
  const user = await getCurrentUser();
  return user && (user.role === "ADMIN" || user.role === "TEACHER") ? user : null;
}

const forbidden = () => errorResponse("هذه الشعبة غير مسندة إليك.", 403);

// الحضور والغياب لشعبة: the section's active children and their records
// between ?from and ?to (inclusive).
//   GET /api/attendance?classId=3&from=2025-11-02&to=2025-11-06

export async function GET(request) {
  try {
    const user = await attendanceUser();

    if (!user) {
      return errorResponse("ليس لديك صلاحية الوصول.", 401);
    }

    const query = new URL(request.url).searchParams;
    const classId = Number(query.get("classId"));
    const from = parseDay(query.get("from"));
    const to = parseDay(query.get("to"));

    if (!Number.isSafeInteger(classId) || classId <= 0) {
      return errorResponse("يرجى اختيار الشعبة.", 400);
    }

    if (!from || !to || to < from || (to - from) / 86400000 > MAX_RANGE_DAYS) {
      return errorResponse("الفترة المحددة غير صالحة.", 400);
    }

    if (user.role === "TEACHER") {
      const own = await prisma.class.count({ where: { id: classId, teacherUserId: user.id } });
      if (!own) return forbidden();
    }

    // A section of an earlier year (chosen in the header): everyone in it
    // then, though they have all left since.
    const past = await prisma.class.count({ where: { id: classId, AcademicYear: { isActive: false } } });
    const students = await prisma.student.findMany({
      where: {
        ...(!past && { status: "ACTIVE" }),
        Enrollment: { some: { classId } }
      },
      select: {
        id: true,
        studentCode: true,
        firstName: true,
        fatherName: true,
        grandfatherName: true,
        lastName: true,
        photo: true,
        Attendance: {
          where: { date: { gte: from, lte: to } },
          select: { date: true, status: true, notes: true }
        }
      }
    });

    students.sort((a, b) =>
      a.studentCode.localeCompare(b.studentCode, "en", { numeric: true })
    );

    return Response.json(
      {
        today: iraqToday(),
        students: students.map(({ Attendance, ...student }) => ({
          ...student,
          // Teachers get names only: no photo.
          photo: user.role === "TEACHER" ? null : student.photo,
          attendance: Object.fromEntries(
            Attendance.map((record) => [
              dayString(record.date),
              { status: record.status, notes: record.notes }
            ])
          )
        }))
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Attendance GET error:", error);

    return errorResponse("حدث خطأ أثناء تحميل الحضور.", 500);
  }
}

// تسجيل الحضور ليوم واحد:
//   PUT { date, entries: [{ studentId, status, notes? }] }
// A null status removes the record (back to "not recorded").

export async function PUT(request) {
  try {
    const user = await attendanceUser();

    if (!user) {
      return errorResponse("ليس لديك صلاحية الوصول.", 401);
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return errorResponse("البيانات المرسلة غير صالحة.", 400);
    }

    const date = parseDay(body?.date);

    if (!date) {
      return errorResponse("التاريخ غير صالح.", 400);
    }

    if (body.date > iraqToday()) {
      return errorResponse("لا يمكن تسجيل الحضور ليوم لم يأتِ بعد.", 400);
    }

    const entries = Array.isArray(body.entries) ? body.entries : [];

    if (entries.length === 0 || entries.length > 200) {
      return errorResponse("لا توجد بيانات حضور للحفظ.", 400);
    }

    for (const entry of entries) {
      if (
        !Number.isSafeInteger(entry?.studentId) ||
        entry.studentId <= 0 ||
        (entry.status !== null && !(entry.status in ATTENDANCE_STATUSES)) ||
        (entry.notes !== undefined && entry.notes !== null &&
          (typeof entry.notes !== "string" || entry.notes.length > 200))
      ) {
        return errorResponse("بيانات الحضور غير صالحة.", 400);
      }
    }

    // A teacher may only mark children enrolled in her own sections.
    if (user.role === "TEACHER") {
      const ids = [...new Set(entries.map((entry) => entry.studentId))];
      const own = await prisma.student.count({
        where: {
          id: { in: ids },
          Enrollment: { some: { Class: { teacherUserId: user.id } } }
        }
      });

      if (own !== ids.length) return forbidden();
    }

    await prisma.$transaction(
      entries.map(({ studentId, status, notes }) =>
        status === null
          ? prisma.attendance.deleteMany({ where: { studentId, date } })
          : prisma.attendance.upsert({
              where: { studentId_date: { studentId, date } },
              create: { studentId, date, status, notes: notes?.trim() || null },
              update: {
                status,
                ...(notes !== undefined ? { notes: notes?.trim() || null } : {})
              }
            })
      )
    );

    return Response.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    // Foreign key: one of the children does not exist.
    if (error.code === "P2003") {
      return errorResponse("أحد الأطفال المحددين غير موجود.", 400);
    }

    console.error("Attendance PUT error:", error);

    return errorResponse("حدث خطأ أثناء حفظ الحضور.", 500);
  }
}
