
import Link from "next/link";
import prisma from "../../lib/prisma";
import { requirePageUser } from "../../lib/auth";
import { ATTENDANCE_STATUSES, SHIFTS, summerYearName, yearLabel } from "../../lib/labels";
import { iraqToday, isWeekend, parseDay } from "../../lib/dates";
import { activeAcademicYear } from "../../lib/student-data";
import AppHeader from "../../components/AppHeader";
import TeacherCell from "../../components/TeacherCell";
import NewYearButton from "../../components/NewYearButton";
import { nextYearName } from "../../lib/finance";

export const dynamic = "force-dynamic";

const card = {
  padding: "18px 20px",
  backgroundColor: "#ffffff",
  borderRadius: "12px"
};

export default async function DashboardPage() {
  const user = await requirePageUser(["ADMIN"]);

  const [year, summer] = await Promise.all([activeAcademicYear(), activeAcademicYear(prisma, "SUMMER")]);
  const today = iraqToday();
  // بدء الدورة الصيفية: from April until the summer is over, once a year.
  const summerName = summerYearName(today.slice(0, 4));
  const canStartSummer =
    year && summer?.name !== summerName && today >= `${today.slice(0, 4)}-04-01` && today < `${today.slice(0, 4)}-09-01`;

  const sectionSelect = {
    id: true,
    name: true,
    shift: true,
    teacherName: true,
    _count: { select: { Enrollment: { where: { Student: { status: "ACTIVE" } } } } }
  };

  const [classes, summerClasses, activeStudents, needsReview, totalParents, todayRecords] =
    await Promise.all([
      prisma.class.findMany({
        where: year ? { academicYearId: year.id } : undefined,
        select: {
          id: true,
          name: true,
          shift: true,
          teacherName: true,
          _count: {
            select: {
              Enrollment: { where: { Student: { status: "ACTIVE" } } }
            }
          }
        },
        orderBy: { name: "asc" }
      }),
      summer
        ? prisma.class.findMany({ where: { academicYearId: summer.id }, select: sectionSelect, orderBy: [{ shift: "desc" }, { name: "asc" }] })
        : [],
      prisma.student.count({ where: { status: "ACTIVE" } }),
      prisma.student.count({ where: { reviewNote: { not: null } } }),
      prisma.parent.count(),
      prisma.attendance.findMany({
        where: { date: parseDay(today), Student: { status: "ACTIVE" } },
        select: {
          status: true,
          Student: { select: { Enrollment: { select: { classId: true } } } }
        }
      })
    ]);

  // Today's attendance per section: { classId: { PRESENT: n, ... } }.
  const attendanceByClass = {};
  for (const record of todayRecords) {
    for (const { classId } of record.Student.Enrollment) {
      const counts = (attendanceByClass[classId] ??= {});
      counts[record.status] = (counts[record.status] || 0) + 1;
    }
  }
  const schoolDay = !isWeekend(today);

  const stats = [
    ["الأطفال النشطون", activeStudents],
    ["أولياء الأمور", totalParents],
    ["بحاجة إلى مراجعة", needsReview, "/dashboard/students?review=1"]
  ];

  return (
    <>
      <AppHeader user={user} active="/dashboard" />

      <main
        style={{
          maxWidth: "1100px",
          margin: "24px auto",
          padding: "0 20px"
        }}
      >
        <h1 style={{ color: "#1e40af", marginBottom: "4px" }}>
          مرحباً، {user.fullName}
        </h1>
        {year && (
          <p style={{ color: "#64748b", marginTop: 0, display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <span>السنة الدراسية <span dir="ltr">{year.name}</span></span>
            {nextYearName(year.name) && iraqToday() >= `${nextYearName(year.name).slice(0, 4)}-07-01` && <NewYearButton next={nextYearName(year.name)} current={year.name} />}
            {canStartSummer && <NewYearButton current={year.name} summer={summerName} />}
          </p>
        )}

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "14px"
          }}
        >
          {stats.map(([label, value, href]) => {
            const body = (
              <>
                <div style={{ color: "#64748b" }}>{label}</div>
                <div style={{ fontSize: "30px", fontWeight: "bold", color: href && value ? "#b45309" : "#1e293b" }}>
                  {value}
                </div>
              </>
            );

            return href && value ? (
              <Link key={label} href={href} style={{ ...card, textDecoration: "none" }}>
                {body}
              </Link>
            ) : (
              <div key={label} style={card}>{body}</div>
            );
          })}
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "14px",
            marginTop: "18px"
          }}
        >
          {Object.entries(SHIFTS).map(([shift, label]) => {
            const rows = classes.filter((cls) => cls.shift === shift);
            const total = rows.reduce((sum, cls) => sum + cls._count.Enrollment, 0);

            return (
              <div key={shift} style={card}>
                <h2 style={{ margin: "0 0 10px", fontSize: "18px", color: "#1e40af" }}>
                  الفترة {label === "صباحي" ? "الصباحية" : "المسائية"}
                </h2>

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <tbody>
                    {rows.map((cls) => (
                      <tr key={cls.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "7px 0" }}>
                          <Link
                            href={`/dashboard/students?class=${cls.id}`}
                            style={{ color: "#1e293b", textDecoration: "none" }}
                          >
                            الشعبة {cls.name}
                          </Link>
                        </td>
                        <td>
                          <TeacherCell
                            classId={cls.id}
                            teacherName={cls.teacherName}
                            sectionName={`${label} ${cls.name}`}
                          />
                        </td>
                        {schoolDay && (
                          <td style={{ fontSize: "13px" }}>
                            <TodayAttendance
                              counts={attendanceByClass[cls.id]}
                              total={cls._count.Enrollment}
                            />
                          </td>
                        )}
                        <td style={{ textAlign: "left", fontWeight: "bold" }}>
                          {cls._count.Enrollment}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ padding: "8px 0", fontWeight: "bold" }}>المجموع</td>
                      <td />
                      {schoolDay && <td />}
                      <td style={{ textAlign: "left", fontWeight: "bold", color: "#1e40af" }}>
                        {total}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })}
        </section>

        {summer && (
          <section style={{ ...card, marginTop: "18px", borderTop: "4px solid #ea580c" }}>
            <h2 style={{ margin: "0 0 10px", fontSize: "18px", color: "#ea580c", display: "flex", gap: "12px", alignItems: "baseline" }}>
              {yearLabel(summer.name)}
              <Link href="/dashboard/students?term=summer" style={{ fontSize: "14px", fontWeight: "normal" }}>الأطفال والدفعات ←</Link>
            </h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {summerClasses.filter((cls) => cls._count.Enrollment > 0 || cls.shift === "MORNING").map((cls) => (
                  <tr key={cls.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "7px 0" }}>
                      <Link href={`/dashboard/students?term=summer&class=${cls.id}`} style={{ color: "#1e293b", textDecoration: "none" }}>
                        {SHIFTS[cls.shift]} — الشعبة {cls.name}
                      </Link>
                    </td>
                    <td>
                      <TeacherCell classId={cls.id} teacherName={cls.teacherName} sectionName={`الصيفية ${SHIFTS[cls.shift]} ${cls.name}`} />
                    </td>
                    {schoolDay && (
                      <td style={{ fontSize: "13px" }}>
                        <TodayAttendance counts={attendanceByClass[cls.id]} total={cls._count.Enrollment} />
                      </td>
                    )}
                    <td style={{ textAlign: "left", fontWeight: "bold" }}>{cls._count.Enrollment}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: "8px 0", fontWeight: "bold" }}>المجموع</td>
                  <td />
                  {schoolDay && <td />}
                  <td style={{ textAlign: "left", fontWeight: "bold", color: "#ea580c" }}>
                    {summerClasses.reduce((sum, cls) => sum + cls._count.Enrollment, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        )}
      </main>
    </>
  );
}

// "حاضر 18 · غائب 2", or a prompt when the section has no records today.
function TodayAttendance({ counts, total }) {
  if (!total) return null;

  if (!counts) {
    return (
      <Link href="/dashboard/attendance" style={{ color: "#94a3b8" }}>
        لم يُسجَّل الحضور
      </Link>
    );
  }

  return Object.entries(ATTENDANCE_STATUSES)
    .filter(([status]) => counts[status])
    .map(([status, s], index) => (
      <span key={status} style={{ color: s.color }}>
        {index > 0 && " · "}
        {s.label} {counts[status]}
      </span>
    ));
}
