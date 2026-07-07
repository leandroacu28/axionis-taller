-- AlterTable
ALTER TABLE `User` ADD COLUMN `apellido` VARCHAR(191) NULL,
    ADD COLUMN `nombre` VARCHAR(191) NULL,
    ADD COLUMN `rol` VARCHAR(191) NOT NULL DEFAULT 'empleado';

-- Backfill: ensure the pre-existing master user has non-null profile fields.
-- Scoped to the master username only — must not relabel other pre-existing users.
UPDATE `User` SET `nombre` = 'Usuario', `apellido` = 'Maestro', `rol` = 'admin' WHERE `username` = 'lmoreno' AND `nombre` IS NULL AND `apellido` IS NULL;
