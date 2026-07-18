-- CreateTable
CREATE TABLE `OrdenTrabajoTipoServicioProducto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ordenTrabajoTipoServicioId` INTEGER NOT NULL,
    `productoId` INTEGER NOT NULL,
    `cantidad` DECIMAL(10, 2) NOT NULL,
    `precioUnitario` DECIMAL(10, 2) NOT NULL,
    `precioTotal` DECIMAL(10, 2) NOT NULL,
    `actualizadoPorId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OrdenTrabajoTipoServicioProducto_ordenTrabajoTipoServicioId__key`(`ordenTrabajoTipoServicioId`, `productoId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OrdenTrabajoTipoServicioProducto` ADD CONSTRAINT `OrdenTrabajoTipoServicioProducto_ordenTrabajoTipoServicioId_fkey` FOREIGN KEY (`ordenTrabajoTipoServicioId`) REFERENCES `OrdenTrabajoTipoServicio`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenTrabajoTipoServicioProducto` ADD CONSTRAINT `OrdenTrabajoTipoServicioProducto_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrdenTrabajoTipoServicioProducto` ADD CONSTRAINT `OrdenTrabajoTipoServicioProducto_actualizadoPorId_fkey` FOREIGN KEY (`actualizadoPorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
