-- DropForeignKey
ALTER TABLE `PresupuestoProducto` DROP FOREIGN KEY `PresupuestoProducto_productoId_fkey`;

-- AlterTable
ALTER TABLE `PresupuestoProducto` ADD COLUMN `descripcionPersonalizada` VARCHAR(255) NULL,
    MODIFY `productoId` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `PresupuestoProducto` ADD CONSTRAINT `PresupuestoProducto_productoId_fkey` FOREIGN KEY (`productoId`) REFERENCES `Producto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

