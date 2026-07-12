-- AlterTable
ALTER TABLE `User` ADD COLUMN `dni` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `User_dni_key` ON `User`(`dni`);
