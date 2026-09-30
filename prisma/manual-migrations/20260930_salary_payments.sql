-- دفعات الرواتب, like a child's الدفعات: Salary becomes what a person
-- is due for a month (salary + bonus − deductions); SalaryPayment holds
-- what was actually paid against it, possibly in several parts. Each new
-- payment gets a receipt number (S-0001, from Sequence `salary-receipt`)
-- and is voided, never deleted. paymentType REFUND (استرجاع) is money the
-- person gives back: stored positive, it subtracts from what was paid.
--
-- Every existing Salary counted as paid in full, so each becomes one
-- payment of its net, without a number (like imported child payments).
-- Then Salary.paidOn / paymentMethod move to the payment and are dropped.
--
-- Take a backup first:
--   mysql <db> < prisma/manual-migrations/20260930_salary_payments.sql
--
-- Then `npx prisma generate`.

CREATE TABLE `SalaryPayment` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `salaryId` INT NOT NULL,
  `amount` DECIMAL(15, 2) NOT NULL,
  `paymentType` VARCHAR(20) NOT NULL DEFAULT 'SALARY',
  `paidOn` DATE NULL,
  `paymentMethod` VARCHAR(20) NULL,
  `receiptNo` VARCHAR(191) NULL,
  `description` VARCHAR(500) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `voidedAt` DATETIME(3) NULL,
  `voidReason` VARCHAR(191) NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `SalaryPayment_receiptNo_key` (`receiptNo`),
  INDEX `SalaryPayment_salaryId_idx` (`salaryId`),
  CONSTRAINT `SalaryPayment_salaryId_fkey`
    FOREIGN KEY (`salaryId`) REFERENCES `Salary` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `SalaryPayment` (`salaryId`, `amount`, `paidOn`, `paymentMethod`, `description`, `createdAt`)
SELECT `id`, `baseSalary` + `bonus` - `deduction`, `paidOn`, `paymentMethod`,
       'منقولة من سجل الرواتب السابق', `createdAt`
FROM `Salary`
WHERE `baseSalary` + `bonus` - `deduction` > 0;

ALTER TABLE `Salary` DROP COLUMN `paidOn`, DROP COLUMN `paymentMethod`;
