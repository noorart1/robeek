-- Teacher (مرشدة) accounts that can only take attendance for their own
-- sections. Additive: a new enum value and a nullable column.
--
--   mysql <db> < prisma/manual-migrations/20260926_teacher_accounts.sql
--
-- Then `npx prisma generate`.

ALTER TABLE `User`
  MODIFY `role` ENUM('ADMIN', 'DEPUTY', 'REGISTRAR', 'TEACHER') NOT NULL DEFAULT 'REGISTRAR';

-- The account allowed to take this section's attendance. One teacher may
-- have several sections (e.g. a morning and an evening one).
ALTER TABLE `Class`
  ADD COLUMN `teacherUserId` INT NULL,
  ADD INDEX `Class_teacherUserId_idx` (`teacherUserId`),
  ADD CONSTRAINT `Class_teacherUserId_fkey`
    FOREIGN KEY (`teacherUserId`) REFERENCES `User` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
