-- CreateTable
CREATE TABLE `_EtiquetaToProducto` (
    `A` INTEGER NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_EtiquetaToProducto_AB_unique`(`A`, `B`),
    INDEX `_EtiquetaToProducto_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `_EtiquetaToProducto` ADD CONSTRAINT `_EtiquetaToProducto_A_fkey` FOREIGN KEY (`A`) REFERENCES `Etiqueta`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_EtiquetaToProducto` ADD CONSTRAINT `_EtiquetaToProducto_B_fkey` FOREIGN KEY (`B`) REFERENCES `Producto`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
