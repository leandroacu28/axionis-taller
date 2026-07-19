-- AlterTable
ALTER TABLE `Vehiculo` ADD COLUMN `patente` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Vehiculo_patente_key` ON `Vehiculo`(`patente`);
