-- Rename `proximoService` to `proximoServiceFecha` (preserves existing data)
-- and add the new `proximoServiceKm` column, instead of Prisma's default
-- drop-and-recreate for the renamed column.
ALTER TABLE `OrdenTrabajoTipoServicio` RENAME COLUMN `proximoService` TO `proximoServiceFecha`;
ALTER TABLE `OrdenTrabajoTipoServicio` ADD COLUMN `proximoServiceKm` INT NULL;
