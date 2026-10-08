
import Link from "next/link";
import prisma from "../../lib/prisma";
import { requirePageUser } from "../../lib/auth";
import { ATTENDANCE_STATUSES, SHIFTS, summerYearName, upcomingSummerName, yearLabel } from "../../lib/labels";
import { iraqToday, isWeekend, parseDay } from "../../lib/dates";
import { yearView } from "../../lib/year-view";
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
  const user = await requirePageUser(["ADMIN", "DEPUTY"]);
  const admin = user.role === "ADMIN";

  // The year chosen in the header (lib/year-view.js), the active one by default.
  const { year, summer, isActive } = await yearView();
  const today = iraqToday();
  // بدء السنة الدراسية: shown with the active year, usable from July of its
  // first year (it ends the current year).
  const nextYear = isActive && year && nextYearName(year.name);
  const nextYearLocked = nextYear && today < `${nextYear.slice(0, 4)}-07-01` ? `يتاح من 1 تموز ${nextYear.slice(0, 4)}` : null;
  // بدء الدورة الصيفية: any time, once per summer (from September, the
  // next one), but only after the school year it ends has been started.
  const summerName = upcomingSummerName(today);
  const canStartSummer = isActive && year && summer?.name !== summerName;
  const summerLocked = year && summerName !== summerYearName(year.name.slice(5)) ? `ابدأ السنة الدراسية ${nextYear} أولاً` : null;

  // The running year counts the children here now; an earlier one, everyone
  // who was enrolled then.
  const here = isActive ? { Student: { status: "ACTIVE" } } : {};
  const inYear = isActive ? { status: "ACTIVE" } : { Enrollment: { some: { academicYearId: year?.id ?? -1 } } };

  const [classes, activeStudents, inactiveStudents, needsReview, totalParents, todayRecords, pastYears, staff] =
    await Promise.all([
      prisma.class.findMany({
        where: year ? { academicYearId: year.id } : undefined,
        select: {
          id: true,
          name: true,
          shift: true,
          teacherName: true,
          staffId: true,
          _count: {
            select: {
              Enrollment: { where: here }
            }
          }
        },
        orderBy: { name: "asc" }
      }),
      prisma.student.count({ where: inYear }),
      // The running year's children who have left (enrolled, not ACTIVE).
      isActive ? prisma.student.count({ where: { status: { not: "ACTIVE" }, Enrollment: { some: { academicYearId: year?.id ?? -1 } } } }) : 0,
      prisma.student.count({ where: { ...inYear, reviewNote: { not: null } } }),
      // Parents of this year's children; the others stay with earlier years.
      prisma.parent.count({ where: { StudentParent: { some: { Student: inYear } } } }),
      prisma.attendance.findMany({
        where: { date: parseDay(today), Student: { status: "ACTIVE" } },
        select: {
          status: true,
          Student: { select: { Enrollment: { select: { classId: true } } } }
        }
      }),
      // The other school years, newest first, with their sections' children
      // (everyone enrolled then, whether still here or not). A link chooses
      // the year (/dashboard/year): plain <a>, never <Link>, whose prefetch
      // would switch the year as soon as the link scrolls into view.
      prisma.academicYear.findMany({
        where: { kind: "REGULAR", id: { not: year?.id ?? -1 } },
        select: {
          id: true,
          name: true,
          Class: {
            select: { id: true, name: true, shift: true, _count: { select: { Enrollment: true } } },
            orderBy: [{ shift: "desc" }, { name: "asc" }]
          }
        },
        orderBy: { id: "desc" }
      }),
      // المرشدة of a section is chosen from الكادر (active people, and
      // anyone still heading a section).
      prisma.staff.findMany({ where: { OR: [{ isActive: true }, { Class: { some: {} } }] }, select: { id: true, name: true, job: true }, orderBy: { name: "asc" } })
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
    [isActive ? "الأطفال النشطون" : "أطفال السنة", activeStudents],
    ...(isActive ? [["الأطفال غير النشطين", inactiveStudents]] : []),
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
            <span>{yearLabel(year.name)}</span>
            {/* Starting a year stays an admin's (it empties the sections). */}
            {admin && nextYear && <NewYearButton next={nextYear} current={year.name} locked={nextYearLocked} />}
            {admin && canStartSummer && <NewYearButton current={year.name} summer={summerName} locked={summerLocked} />}
            {admin && isActive && pastYears.length > 0 && <Link href="/dashboard/carry-over">⇠ نقل من السنة السابقة</Link>}
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
                            staffId={cls.staffId}
                            staff={staff}
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

        {/* The summer course has pages of its own: chosen like a year
            (/dashboard/year; a plain <a>, never a prefetching <Link>). */}
        {summer && (
          <section style={{ ...card, marginTop: "18px", borderTop: "4px solid #ea580c" }}>
            <h2 style={{ margin: 0, fontSize: "18px", color: "#ea580c", display: "flex", gap: "12px", alignItems: "baseline" }}>
              {yearLabel(summer.name)}
              <a href={`/dashboard/year?id=${summer.id}&to=/dashboard`} style={{ fontSize: "14px", fontWeight: "normal" }}>
                عرض الدورة الصيفية ←
              </a>
            </h2>
          </section>
        )}

        {pastYears.length > 0 && (
          <section style={{ ...card, marginTop: "18px", borderTop: "4px solid #475569" }}>
            <h2 style={{ margin: "0 0 10px", fontSize: "18px", color: "#475569" }}>{isActive ? "السنوات السابقة" : "السنوات الأخرى"}</h2>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {pastYears.map((y) => (
                  <tr key={y.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "7px 0", whiteSpace: "nowrap" }}>
                      <a href={`/dashboard/year?id=${y.id}&to=/dashboard`} style={{ color: "#1e293b" }}>{yearLabel(y.name)}</a>
                    </td>
                    <td style={{ fontSize: "13px" }}>
                      {y.Class.filter((cls) => cls._count.Enrollment > 0).map((cls, i) => (
                        <span key={cls.id}>
                          {i > 0 && " · "}
                          <a href={`/dashboard/year?id=${y.id}&to=${encodeURIComponent(`/dashboard/students?class=${cls.id}`)}`} style={{ color: "#64748b" }}>
                            {SHIFTS[cls.shift]} {cls.name}: {cls._count.Enrollment}
                          </a>
                        </span>
                      ))}
                    </td>
                    <td style={{ textAlign: "left", fontWeight: "bold" }}>
                      {y.Class.reduce((sum, cls) => sum + cls._count.Enrollment, 0)}
                    </td>
                  </tr>
                ))}
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
