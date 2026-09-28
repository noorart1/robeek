-- نوع الدفع: cash or card. Additive, one nullable column; payments
-- recorded before this stay NULL (method unknown).
--
--   mysql <db> < prisma/manual-migrations/20260928_payment_method.sql
--
-- Then `npx prisma generate`.

ALTER TABLE `Payment`
  ADD COLUMN `paymentMethod` VARCHAR(20) NULL;
