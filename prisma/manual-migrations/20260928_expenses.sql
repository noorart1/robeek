-- المصاريف: the centre's spending, as in the accounts workbook's
-- «المصاريف العامة» and «مصاريف الأصول» sheets. Additive: one new table.
--
--   mysql <db> < prisma/manual-migrations/20260928_expenses.sql
--
-- Then `npx prisma generate`.

CREATE TABLE `Expense` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `date` DATE NOT NULL,
  `category` VARCHAR(20) NOT NULL DEFAULT 'GENERAL',
  `item` VARCHAR(191) NOT NULL,
  `amount` DECIMAL(15, 2) NOT NULL,
  `paymentMethod` VARCHAR(20) NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `Expense_date_idx` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
