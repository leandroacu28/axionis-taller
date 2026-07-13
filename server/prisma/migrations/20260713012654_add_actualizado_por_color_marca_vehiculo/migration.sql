-- AlterTable
ALTER TABLE `Color` ADD COLUMN `actualizadoPorId` INTEGER NULL;

-- AlterTable
ALTER TABLE `Marca` ADD COLUMN `actualizadoPorId` INTEGER NULL;

-- AlterTable
ALTER TABLE `Vehiculo` ADD COLUMN `actualizadoPorId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `Color` ADD CONSTRAINT `Color_actualizadoPorId_fkey` FOREIGN KEY (`actualizadoPorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Marca` ADD CONSTRAINT `Marca_actualizadoPorId_fkey` FOREIGN KEY (`actualizadoPorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vehiculo` ADD CONSTRAINT `Vehiculo_actualizadoPorId_fkey` FOREIGN KEY (`actualizadoPorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
