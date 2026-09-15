-- CreateEnum
CREATE TYPE "SystemLayout" AS ENUM ('QUIET_OPS', 'MOTION_CANVAS', 'CRAVE_MARKET');

-- AlterTable
ALTER TABLE "stores"
ADD COLUMN "system_layout" "SystemLayout" NOT NULL DEFAULT 'MOTION_CANVAS';
