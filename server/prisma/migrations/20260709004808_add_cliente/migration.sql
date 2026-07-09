-- CreateTable
CREATE TABLE `Cliente` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `razonSocial` VARCHAR(191) NOT NULL,
    `tipoIdentificacion` VARCHAR(191) NOT NULL,
    `identificacion` VARCHAR(191) NOT NULL,
    `telefono` VARCHAR(191) NOT NULL,
    `domicilio` VARCHAR(191) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoPorId` INTEGER NULL,
    `actualizadoPorId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Cliente_identificacion_key`(`identificacion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Cliente` ADD CONSTRAINT `Cliente_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Cliente` ADD CONSTRAINT `Cliente_actualizadoPorId_fkey` FOREIGN KEY (`actualizadoPorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
