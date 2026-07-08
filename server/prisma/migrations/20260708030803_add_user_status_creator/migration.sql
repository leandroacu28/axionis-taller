-- AlterTable
ALTER TABLE `User` ADD COLUMN `activo` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `creadoPorId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: master user's rol changes from 'admin' to 'maestro'.
-- Scoped by username, NOT a broad `WHERE rol = 'admin'`.
UPDATE `User` SET `rol` = 'maestro' WHERE `username` = 'lmoreno';
