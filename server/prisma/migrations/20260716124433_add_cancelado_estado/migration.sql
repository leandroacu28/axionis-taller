-- AlterTable
ALTER TABLE `OrdenTrabajo` MODIFY `estado` ENUM('pendiente', 'en_proceso', 'terminado', 'cancelado') NOT NULL DEFAULT 'pendiente';
