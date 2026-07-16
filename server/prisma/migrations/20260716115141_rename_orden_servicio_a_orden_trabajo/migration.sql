-- RenameTable (preserves data — 2 existing rows in OrdenServicio)
RENAME TABLE `OrdenServicio` TO `OrdenTrabajo`;
RENAME TABLE `_OrdenServicioToTipoServicio` TO `_OrdenTrabajoToTipoServicio`;

-- RenameIndex
ALTER TABLE `OrdenTrabajo` RENAME INDEX `OrdenServicio_numero_key` TO `OrdenTrabajo_numero_key`;
ALTER TABLE `_OrdenTrabajoToTipoServicio` RENAME INDEX `_OrdenServicioToTipoServicio_AB_unique` TO `_OrdenTrabajoToTipoServicio_AB_unique`;
ALTER TABLE `_OrdenTrabajoToTipoServicio` RENAME INDEX `_OrdenServicioToTipoServicio_B_index` TO `_OrdenTrabajoToTipoServicio_B_index`;

-- RenameForeignKey (MySQL can't rename constraints directly — drop + re-add with matching ON DELETE/ON UPDATE rules)
ALTER TABLE `OrdenTrabajo` DROP FOREIGN KEY `OrdenServicio_clienteId_fkey`;
ALTER TABLE `OrdenTrabajo` ADD CONSTRAINT `OrdenTrabajo_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `Cliente`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `OrdenTrabajo` DROP FOREIGN KEY `OrdenServicio_vehiculoId_fkey`;
ALTER TABLE `OrdenTrabajo` ADD CONSTRAINT `OrdenTrabajo_vehiculoId_fkey` FOREIGN KEY (`vehiculoId`) REFERENCES `Vehiculo`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `OrdenTrabajo` DROP FOREIGN KEY `OrdenServicio_mecanicoId_fkey`;
ALTER TABLE `OrdenTrabajo` ADD CONSTRAINT `OrdenTrabajo_mecanicoId_fkey` FOREIGN KEY (`mecanicoId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `OrdenTrabajo` DROP FOREIGN KEY `OrdenServicio_creadoPorId_fkey`;
ALTER TABLE `OrdenTrabajo` ADD CONSTRAINT `OrdenTrabajo_creadoPorId_fkey` FOREIGN KEY (`creadoPorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `OrdenTrabajo` DROP FOREIGN KEY `OrdenServicio_actualizadoPorId_fkey`;
ALTER TABLE `OrdenTrabajo` ADD CONSTRAINT `OrdenTrabajo_actualizadoPorId_fkey` FOREIGN KEY (`actualizadoPorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `_OrdenTrabajoToTipoServicio` DROP FOREIGN KEY `_OrdenServicioToTipoServicio_A_fkey`;
ALTER TABLE `_OrdenTrabajoToTipoServicio` ADD CONSTRAINT `_OrdenTrabajoToTipoServicio_A_fkey` FOREIGN KEY (`A`) REFERENCES `OrdenTrabajo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `_OrdenTrabajoToTipoServicio` DROP FOREIGN KEY `_OrdenServicioToTipoServicio_B_fkey`;
ALTER TABLE `_OrdenTrabajoToTipoServicio` ADD CONSTRAINT `_OrdenTrabajoToTipoServicio_B_fkey` FOREIGN KEY (`B`) REFERENCES `TipoServicio`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
