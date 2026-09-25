-- Receipts (وصل قبض): numbered payments that are voided, never deleted.
-- Additive: two nullable columns and a new table.
--
--   mysql <db> < prisma/manual-migrations/20260927_receipts.sql
--
-- Then `npx prisma generate`.

-- A cancelled receipt keeps its row and number but stops counting.
ALTER TABLE `Payment`
  ADD COLUMN `voidedAt` DATETIME(3) NULL,
  ADD COLUMN `voidReason` VARCHAR(191) NULL;

-- Named counters. Receipt numbers come from here rather than from
-- MAX(receiptNo), so a number is never handed out twice even after the
-- payment carrying it has been removed with its child.
CREATE TABLE `Sequence` (
  `name` VARCHAR(50) NOT NULL,
  `value` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
