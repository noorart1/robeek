-- المعاون (role DEPUTY): which tabs of المالية they may see (READ) or also
-- change (WRITE), as JSON, e.g. {"salaries":"WRITE","summary":"READ"}.
-- NULL for every other role. Additive.
--
--   mysql <db> < prisma/manual-migrations/20261004_user_finance_access.sql
--
-- Then `npx prisma generate`.

ALTER TABLE `User`
  ADD COLUMN `financeAccess` TEXT NULL AFTER `staffId`;
