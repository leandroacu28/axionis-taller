-- CreateTable
CREATE TABLE `Producto` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `descripcion` VARCHAR(191) NOT NULL,
    `unidadMedidaId` INTEGER NOT NULL,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `cantidadInicial` DECIMAL(10, 2) NOT NULL,
    `alertaStock` BOOLEAN NOT NULL DEFAULT false,
    `cantidadMinima` DECIMAL(10, 2) NOT NULL,
    `precioCompra` DECIMAL(10, 2) NOT NULL,
    `porcentajeGanancia` DECIMAL(5, 2) NOT NULL,
    `precioVenta` DECIMAL(10, 2) NOT NULL,
    `precioMayorista` DECIMAL(10, 2) NOT NULL,
    `alicuotaIva` ENUM('21', '10.5') NOT NULL,
    `creadoPorId` INTEGER NULL,
    `actualizadoPorId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Producto_descripcion_key`(`descripcion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Producto` ADD CONSTRAINT `Producto_unidadMedidaId_fkey` FOREIGN KEY (`unidadMedidaId`) REFERENCES `UnidadMedida`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Producto` ADD CONSTRAINT `Producto_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Producto` ADD CONSTRAINT `Producto_actualizadoPorId_fkey` FOREIGN KEY (`actualizadoPorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
