-- AlterTable
ALTER TABLE `User` ADD COLUMN `apellido` VARCHAR(191) NULL,
    ADD COLUMN `nombre` VARCHAR(191) NULL,
    ADD COLUMN `rol` VARCHAR(191) NOT NULL DEFAULT 'admin';

-- Backfill: ensure the pre-existing master user has non-null profile fields
UPDATE `User` SET `nombre` = 'Usuario', `apellido` = 'Maestro' WHERE `nombre` IS NULL AND `apellido` IS NULL;
