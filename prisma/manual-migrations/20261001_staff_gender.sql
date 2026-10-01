-- الكادر: الجنس (MALE / FEMALE, as for children), optional. Additive.
--
--   mysql <db> < prisma/manual-migrations/20261001_staff_gender.sql
--
-- Then `npx prisma generate`.

ALTER TABLE `Staff`
  ADD COLUMN `gender` VARCHAR(10) NULL AFTER `name`;
