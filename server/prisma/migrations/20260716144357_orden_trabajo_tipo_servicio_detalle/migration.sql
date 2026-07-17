-- CreateTable (explicit join model replacing the implicit
-- `_OrdenTrabajoToTipoServicio` M2M table, so each (orden, tipoServicio)
-- pair can carry its own progress fields)
CREATE TABLE `OrdenTrabajoTipoServicio` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ordenTrabajoId` INTEGER NOT NULL,
    `tipoServicioId` INTEGER NOT NULL,
    `estado` ENUM('pendiente', 'en_proceso', 'terminado', 'cancelado') NOT NULL DEFAULT 'pendiente',
    `diagnosticoId` INTEGER NULL,
    `trabajoRealizado` TEXT NULL,
    `proximoService` DATETIME(3) NULL,
    `fechaFinalizacion` DATETIME(3) NULL,
    `actualizadoPorId` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OrdenTrabajoTipoServicio_ordenTrabajoId_tipoServicioId_key`(`ordenTrabajoId`, `tipoServicioId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Migrate existing associations (5 rows as of this migration) — preserves
-- data instead of dropping it like a plain additive migration would.
INSERT INTO `OrdenTrabajoTipoServicio` (`ordenTrabajoId`, `tipoServicioId`, `estado`, `createdAt`, `updatedAt`)
SELECT `A`, `B`, 'pendiente', NOW(3), NOW(3) FROM `_OrdenTrabajoToTipoServicio`;

-- AddForeignKey
ALTER TABLE `OrdenTrabajoTipoServicio` ADD CONSTRAINT `OrdenTrabajoTipoServicio_ordenTrabajoId_fkey` FOREIGN KEY (`ordenTrabajoId`) REFERENCES `OrdenTrabajo`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `OrdenTrabajoTipoServicio` ADD CONSTRAINT `OrdenTrabajoTipoServicio_tipoServicioId_fkey` FOREIGN KEY (`tipoServicioId`) REFERENCES `TipoServicio`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `OrdenTrabajoTipoServicio` ADD CONSTRAINT `OrdenTrabajoTipoServicio_diagnosticoId_fkey` FOREIGN KEY (`diagnosticoId`) REFERENCES `Diagnostico`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `OrdenTrabajoTipoServicio` ADD CONSTRAINT `OrdenTrabajoTipoServicio_actualizadoPorId_fkey` FOREIGN KEY (`actualizadoPorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- DropTable (implicit M2M join table is now fully superseded)
DROP TABLE `_OrdenTrabajoToTipoServicio`;
