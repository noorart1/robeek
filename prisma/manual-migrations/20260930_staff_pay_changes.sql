-- سجل تغيير الراتب: every change to a person's «الراتب الاسمي» or
-- «المكافآت», from الكادر or from recording their newest salary.
-- Additive: one new table. changedBy is the admin's name as it was then.
--
--   mysql <db> < prisma/manual-migrations/20260930_staff_pay_changes.sql
--
-- Then `npx prisma generate`.

CREATE TABLE `StaffPayChange` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `staffId` INT NOT NULL,
  `oldBaseSalary` DECIMAL(15, 2) NULL,
  `newBaseSalary` DECIMAL(15, 2) NULL,
  `oldBonus` DECIMAL(15, 2) NULL,
  `newBonus` DECIMAL(15, 2) NULL,
  `changedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `StaffPayChange_staffId_idx` (`staffId`),
  CONSTRAINT `StaffPayChange_staffId_fkey`
    FOREIGN KEY (`staffId`) REFERENCES `Staff` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
