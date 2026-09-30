-- الدورة الصيفية: the summer course (May–August) is a year of its own,
-- kind SUMMER (named «صيف 2026»), with its own sections, enrollments,
-- fees, payments and receipt numbers (SU26-0001). One REGULAR and one
-- SUMMER year can be active at once: registration for September goes on
-- while the summer course runs. Additive: existing years become REGULAR.
--
--   mysql <db> < prisma/manual-migrations/20261001_summer_course.sql
--
-- Then `npx prisma generate`.

ALTER TABLE `AcademicYear`
  ADD COLUMN `kind` VARCHAR(10) NOT NULL DEFAULT 'REGULAR';
