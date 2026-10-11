ALTER TABLE "printer_configurations"
 ADD COLUMN "transport" TEXT NOT NULL DEFAULT 'WEB_SERIAL',
 ADD COLUMN "windows_queue_id" TEXT, ADD COLUMN "windows_queue_name" TEXT,
 ADD COLUMN "windows_driver_name" TEXT, ADD COLUMN "windows_port_name" TEXT,
 ADD COLUMN "windows_print_processor" TEXT, ADD COLUMN "windows_data_type" TEXT,
 ADD COLUMN "windows_capabilities" JSONB, ADD COLUMN "bridge_installation_id" TEXT,
 ADD COLUMN "adapter_id" TEXT NOT NULL DEFAULT 'esc-pos', ADD COLUMN "columns" INTEGER NOT NULL DEFAULT 48,
 ADD COLUMN "encoding" TEXT NOT NULL DEFAULT 'cp850', ADD COLUMN "auto_cut" BOOLEAN NOT NULL DEFAULT true,
 ADD COLUMN "copies" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "last_seen_at" TIMESTAMP(3), ADD COLUMN "last_known_status" TEXT,
 ADD CONSTRAINT "printer_transport_valid" CHECK ("transport" IN ('WEB_SERIAL', 'WINDOWS_BRIDGE')),
 ADD CONSTRAINT "printer_windows_target_valid" CHECK (
  ("transport" = 'WEB_SERIAL' AND "windows_queue_id" IS NULL AND "windows_queue_name" IS NULL AND "windows_driver_name" IS NULL AND "windows_port_name" IS NULL AND "windows_print_processor" IS NULL AND "windows_data_type" IS NULL AND "windows_capabilities" IS NULL AND "bridge_installation_id" IS NULL)
  OR ("transport" = 'WINDOWS_BRIDGE' AND "windows_queue_id" IS NOT NULL AND "windows_queue_name" IS NOT NULL AND "windows_driver_name" IS NOT NULL AND "windows_capabilities" IS NOT NULL)
 );
CREATE UNIQUE INDEX "printer_configurations_store_id_windows_queue_id_key" ON "printer_configurations"("store_id", "windows_queue_id");
