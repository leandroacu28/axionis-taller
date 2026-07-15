-- CreateTable
CREATE TABLE `OrdenServicio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `numero` VARCHAR(191) NULL,
    `fechaIngreso` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `kilometros` INTEGER NOT NULL,
    `prioridad` ENUM('normal', 'alta', 'urgente') NOT NULL DEFAULT 'normal',
    `motivoIngreso` TEXT NOT NULL,
    `estado` ENUM('pendiente', 'en_proceso', 'terminado') NOT NULL DEFAULT 'pendiente',
    `clienteId` INTEGER NOT NULL,
    `vehiculoId` INTEGER NOT NULL,
    `mecanicoId` INTEGER NOT NULL,
    `creadoPorId` INTEGER NULL,
    `actualizadoPorId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OrdenServicio_numero_key`(`numero`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_OrdenServicioToTipoServicio` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_OrdenServicioToTipoServicio_AB_unique`(`A`, `B`),
    INDEX `_OrdenServicioToTipoServicio_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OrdenServicio` ADD CONSTRAINT `OrdenServicio_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `Cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenServicio` ADD CONSTRAINT `OrdenServicio_vehiculoId_fkey` FOREIGN KEY (`vehiculoId`) REFERENCES `Vehiculo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenServicio` ADD CONSTRAINT `OrdenServicio_mecanicoId_fkey` FOREIGN KEY (`mecanicoId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenServicio` ADD CONSTRAINT `OrdenServicio_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenServicio` ADD CONSTRAINT `OrdenServicio_actualizadoPorId_fkey` FOREIGN KEY (`actualizadoPorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_OrdenServicioToTipoServicio` ADD CONSTRAINT `_OrdenServicioToTipoServicio_A_fkey` FOREIGN KEY (`A`) REFERENCES `OrdenServicio`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_OrdenServicioToTipoServicio` ADD CONSTRAINT `_OrdenServicioToTipoServicio_B_fkey` FOREIGN KEY (`B`) REFERENCES `TipoServicio`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
