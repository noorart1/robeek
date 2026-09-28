-- الكادر والرواتب: the centre's staff (the columns of the school's
-- staff.xlsx) and one salary record per person per calendar month.
-- Additive: two new tables.
--
--   mysql <db> < prisma/manual-migrations/20260928_staff.sql
--
-- Then `npx prisma generate`.

CREATE TABLE `Staff` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `birthDate` DATE NULL,
  `address` VARCHAR(500) NULL,
  `phone` VARCHAR(30) NULL,
  `education` VARCHAR(191) NULL,
  `shift` VARCHAR(20) NULL,
  `job` VARCHAR(191) NULL,
  `baseSalary` DECIMAL(15, 2) NULL,
  `bonus` DECIMAL(15, 2) NULL,
  `startDate` DATE NULL,
  `contract` VARCHAR(191) NULL,
  `notes` TEXT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Net pay is baseSalary + bonus - deduction, computed, not stored.
CREATE TABLE `Salary` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `staffId` INT NOT NULL,
  `month` CHAR(7) NOT NULL,
  `baseSalary` DECIMAL(15, 2) NOT NULL,
  `bonus` DECIMAL(15, 2) NOT NULL DEFAULT 0,
  `deduction` DECIMAL(15, 2) NOT NULL DEFAULT 0,
  `paidOn` DATE NULL,
  `paymentMethod` VARCHAR(20) NULL,
  `notes` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Salary_staffId_month_key` (`staffId`, `month`),
  CONSTRAINT `Salary_staffId_fkey`
    FOREIGN KEY (`staffId`) REFERENCES `Staff` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
