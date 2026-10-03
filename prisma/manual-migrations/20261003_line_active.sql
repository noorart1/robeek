-- خطوط النقل: نشط / غير نشط. A new school year makes every line inactive
-- (like الكادر), keeping its riders as history. Additive.
--
--   mysql <db> < prisma/manual-migrations/20261003_line_active.sql
--
-- Then `npx prisma generate`.

ALTER TABLE `TransportLine`
  ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT TRUE AFTER `shift`;
