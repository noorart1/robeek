-- One teacher, one record: a section's المرشدة and a sign-in account can
-- point at her row in الكادر (Staff), so her name is kept in one place.
-- Class.teacherName stays as the displayed name, kept in step with
-- Staff.name; sections without a link keep their typed name. Additive.
--
--   mysql <db> < prisma/manual-migrations/20261001_staff_links.sql
--
-- Then `npx prisma generate`.

ALTER TABLE `Class`
  ADD COLUMN `staffId` INT NULL,
  ADD INDEX `Class_staffId_idx` (`staffId`),
  ADD CONSTRAINT `Class_staffId_fkey`
    FOREIGN KEY (`staffId`) REFERENCES `Staff` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- At most one account per person.
ALTER TABLE `User`
  ADD COLUMN `staffId` INT NULL,
  ADD UNIQUE INDEX `User_staffId_key` (`staffId`),
  ADD CONSTRAINT `User_staffId_fkey`
    FOREIGN KEY (`staffId`) REFERENCES `Staff` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
