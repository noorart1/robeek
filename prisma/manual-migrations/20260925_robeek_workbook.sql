-- Fields needed to hold the Robeek 2025-2026 enrollment workbook.
--
-- This project does not use `prisma migrate` (the schema was introspected
-- with `prisma db pull`), so schema changes are applied by hand. Run once,
-- after a full backup, then `prisma generate`. Additive only: nothing is
-- dropped, and the two MODIFYs only relax NOT NULL.
--
--   mysql <db> < prisma/manual-migrations/20260925_robeek_workbook.sql

-- Iraqi triple names: first + father + grandfather; the laqab is optional.
ALTER TABLE `Student`
  MODIFY `lastName` VARCHAR(191) NULL,
  ADD COLUMN `grandfatherName` VARCHAR(191) NULL AFTER `fatherName`,
  -- The workbook records only the birth year (المواليد).
  ADD COLUMN `birthYear` INT NULL AFTER `birthDate`,
  ADD COLUMN `transportLineId` INT NULL,
  ADD COLUMN `transportOrder` INT NULL,
  -- Problems found during import that a person should check.
  ADD COLUMN `reviewNote` TEXT NULL;

-- Mothers are listed by phone number only.
ALTER TABLE `Parent`
  MODIFY `firstName` VARCHAR(191) NULL,
  MODIFY `lastName` VARCHAR(191) NULL;

-- The section's supervising teacher (مرشدة).
ALTER TABLE `Class`
  ADD COLUMN `teacherName` VARCHAR(191) NULL;

-- نوع الدوام: REGULAR (عادي) / EMPLOYEE (موظفين), MONTHLY / YEARLY.
ALTER TABLE `Enrollment`
  ADD COLUMN `attendanceType` VARCHAR(191) NULL,
  ADD COLUMN `paymentPlan` VARCHAR(191) NULL;

-- School bus lines (الخطوط), named after the driver.
CREATE TABLE `TransportLine` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `driverPhone` VARCHAR(191) NULL,
  `shift` VARCHAR(191) NOT NULL DEFAULT 'MORNING',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `Student`
  ADD INDEX `Student_transportLineId_idx` (`transportLineId`),
  ADD CONSTRAINT `Student_transportLineId_fkey`
    FOREIGN KEY (`transportLineId`) REFERENCES `TransportLine` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
