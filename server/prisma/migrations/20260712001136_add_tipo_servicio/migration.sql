-- CreateTable
CREATE TABLE `TipoServicio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `descripcion` VARCHAR(191) NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creadoPorId` INTEGER NULL,
    `actualizadoPorId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TipoServicio_descripcion_key`(`descripcion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TipoServicio` ADD CONSTRAINT `TipoServicio_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TipoServicio` ADD CONSTRAINT `TipoServicio_actualizadoPorId_fkey` FOREIGN KEY (`actualizadoPorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
