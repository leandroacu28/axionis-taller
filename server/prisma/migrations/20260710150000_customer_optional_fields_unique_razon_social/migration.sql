-- AlterTable
ALTER TABLE `Cliente` MODIFY `identificacion` VARCHAR(191) NULL,
    MODIFY `telefono` VARCHAR(191) NULL,
    MODIFY `domicilio` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Cliente_razonSocial_key` ON `Cliente`(`razonSocial`);
