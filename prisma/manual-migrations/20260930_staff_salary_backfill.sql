-- «الراتب الاسمي» and «المكافآت» in الكادر follow each person's newest
-- recorded salary (PUT /api/salaries keeps them in step from now on).
-- The accounts import filled Salary but left Staff empty: copy the newest
-- month across wherever Staff has no salary yet. Data only, re-runnable.
--
--   mysql <db> < prisma/manual-migrations/20260930_staff_salary_backfill.sql

UPDATE `Staff` s
JOIN `Salary` l ON l.`staffId` = s.`id`
  AND l.`month` = (SELECT MAX(`month`) FROM `Salary` WHERE `staffId` = s.`id`)
SET s.`baseSalary` = l.`baseSalary`,
    s.`bonus` = l.`bonus`,
    s.`updatedAt` = NOW()
WHERE s.`baseSalary` IS NULL;
