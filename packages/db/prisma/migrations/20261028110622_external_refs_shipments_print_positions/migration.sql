-- Taak 2: herkomst, uitgaande leveringen en bedrukposities.
--
-- DATASANERING VOORAF
-- LogisticsStatus wordt uitgaand gemaakt (richting klant). De oude waarden
-- PARTIALLY_RECEIVED en RECEIVED waren inkomende begrippen en verdwijnen;
-- inkomende ontvangsten staan in goods_receipts en PurchaseStatus. Op dit
-- moment staat alleen NONE in gebruik, dus dit is in de praktijk een no-op.
UPDATE "order_lines" SET "logisticsStatus" = 'EXPECTED'  WHERE "logisticsStatus"::text = 'PARTIALLY_RECEIVED';
UPDATE "order_lines" SET "logisticsStatus" = 'DELIVERED' WHERE "logisticsStatus"::text = 'RECEIVED';

-- CreateEnum
CREATE TYPE "ExternalSystem" AS ENUM ('TEAMLEADER', 'SNELSTART', 'MOLLIE', 'MICROSOFT_GRAPH', 'SUPPLIER', 'PROMOHOUSE', 'OTHER');

-- CreateEnum
CREATE TYPE "ShipmentMethod" AS ENUM ('SUPPLIER_DIRECT', 'OWN_SHIPMENT');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('DRAFT', 'READY', 'SHIPPED', 'DELIVERED', 'FAILED', 'CANCELLED');

-- AlterEnum
BEGIN;
CREATE TYPE "LogisticsStatus_new" AS ENUM ('NONE', 'EXPECTED', 'PREPARED', 'SHIPPED', 'PARTIALLY_DELIVERED', 'DELIVERED');
ALTER TABLE "public"."order_lines" ALTER COLUMN "logisticsStatus" DROP DEFAULT;
ALTER TABLE "order_lines" ALTER COLUMN "logisticsStatus" TYPE "LogisticsStatus_new" USING ("logisticsStatus"::text::"LogisticsStatus_new");
ALTER TYPE "LogisticsStatus" RENAME TO "LogisticsStatus_old";
ALTER TYPE "LogisticsStatus_new" RENAME TO "LogisticsStatus";
DROP TYPE "public"."LogisticsStatus_old";
ALTER TABLE "order_lines" ALTER COLUMN "logisticsStatus" SET DEFAULT 'NONE';
COMMIT;

-- AlterEnum
ALTER TYPE "MappingDomain" ADD VALUE 'PRINT_POSITION';

-- DropIndex
DROP INDEX "product_print_options_productId_printMethodId_position_key";

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "shipmentId" UUID;

-- AlterTable
ALTER TABLE "order_line_print_jobs" ADD COLUMN     "printPositionId" UUID;

-- AlterTable
ALTER TABLE "quote_item_print_jobs" ADD COLUMN     "printPositionId" UUID;

-- CreateTable
CREATE TABLE "print_positions" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_references" (
    "id" UUID NOT NULL,
    "system" "ExternalSystem" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "externalNumber" TEXT,
    "payload" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "orderId" UUID NOT NULL,
    "deliveryAddressId" UUID,
    "method" "ShipmentMethod" NOT NULL DEFAULT 'OWN_SHIPMENT',
    "status" "ShipmentStatus" NOT NULL DEFAULT 'DRAFT',
    "supplierId" UUID,
    "carrier" TEXT,
    "trackingCode" TEXT,
    "trackingUrl" TEXT,
    "plannedShipDate" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "expectedDeliveryDate" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "recipientName" TEXT,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_items" (
    "id" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "orderLineId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "print_positions_key_key" ON "print_positions"("key");

-- CreateIndex
CREATE INDEX "external_references_entityType_entityId_idx" ON "external_references"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "external_references_system_entityType_externalId_key" ON "external_references"("system", "entityType", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "external_references_system_entityType_entityId_key" ON "external_references"("system", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_number_key" ON "shipments"("number");

-- CreateIndex
CREATE INDEX "shipments_orderId_idx" ON "shipments"("orderId");

-- CreateIndex
CREATE INDEX "shipments_status_idx" ON "shipments"("status");

-- CreateIndex
CREATE INDEX "shipments_trackingCode_idx" ON "shipments"("trackingCode");

-- CreateIndex
CREATE INDEX "shipment_items_orderLineId_idx" ON "shipment_items"("orderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_items_shipmentId_orderLineId_key" ON "shipment_items"("shipmentId", "orderLineId");

-- CreateIndex
CREATE INDEX "documents_shipmentId_idx" ON "documents"("shipmentId");

-- AddForeignKey
ALTER TABLE "quote_item_print_jobs" ADD CONSTRAINT "quote_item_print_jobs_printPositionId_fkey" FOREIGN KEY ("printPositionId") REFERENCES "print_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_line_print_jobs" ADD CONSTRAINT "order_line_print_jobs_printPositionId_fkey" FOREIGN KEY ("printPositionId") REFERENCES "print_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_deliveryAddressId_fkey" FOREIGN KEY ("deliveryAddressId") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_items" ADD CONSTRAINT "shipment_items_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Bedrukposities: standaardwaarden, en de vrije tekst overzetten
-- ---------------------------------------------------------------------------
INSERT INTO "print_positions" ("id", "key", "name", "sort", "createdAt", "updatedAt") VALUES
  (gen_random_uuid(), 'front',  'Voorzijde',   10, now(), now()),
  (gen_random_uuid(), 'back',   'Achterzijde', 20, now(), now()),
  (gen_random_uuid(), 'side',   'Zijkant',     30, now(), now()),
  (gen_random_uuid(), 'lid',    'Deksel',      40, now(), now()),
  (gen_random_uuid(), 'bottom', 'Onderzijde',  50, now(), now()),
  (gen_random_uuid(), 'sleeve', 'Mouw',        60, now(), now()),
  (gen_random_uuid(), 'other',  'Overig',      99, now(), now());

-- Eerst nullable toevoegen, dan vullen, dan pas verplicht maken: anders faalt
-- de migratie op bestaande bedrukopties.
ALTER TABLE "product_print_options" ADD COLUMN "positionLabel"   TEXT;
ALTER TABLE "product_print_options" ADD COLUMN "printPositionId" UUID;

UPDATE "product_print_options" SET "positionLabel" = "position" WHERE "position" IS NOT NULL;

UPDATE "product_print_options" o
   SET "printPositionId" = p."id"
  FROM "print_positions" p
 WHERE p."key" = CASE lower(coalesce(o."position", ''))
                   WHEN 'voorzijde'   THEN 'front'
                   WHEN 'front'       THEN 'front'
                   WHEN 'achterzijde' THEN 'back'
                   WHEN 'back'        THEN 'back'
                   WHEN 'zijkant'     THEN 'side'
                   WHEN 'side'        THEN 'side'
                   WHEN 'deksel'      THEN 'lid'
                   WHEN 'lid'         THEN 'lid'
                   WHEN 'onderzijde'  THEN 'bottom'
                   WHEN 'mouw'        THEN 'sleeve'
                   ELSE 'other'
                 END;

ALTER TABLE "product_print_options" ALTER COLUMN "printPositionId" SET NOT NULL;
ALTER TABLE "product_print_options" DROP COLUMN "position";

CREATE INDEX "product_print_options_printPositionId_idx" ON "product_print_options"("printPositionId");
CREATE UNIQUE INDEX "product_print_options_productId_printMethodId_printPosition_key" ON "product_print_options"("productId", "printMethodId", "printPositionId");
ALTER TABLE "product_print_options" ADD CONSTRAINT "product_print_options_printPositionId_fkey" FOREIGN KEY ("printPositionId") REFERENCES "print_positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Orderregel-bedrukkingen koppelen op basis van de bewaarde tekst.
-- Vastgezette offerteversies worden met opzet NIET aangevuld: daar is de tekst
-- in `position` het vastgelegde gegeven (ADR-0007), en een update zou de
-- onveranderlijkheidstrigger terecht laten afgaan.
UPDATE "order_line_print_jobs" j
   SET "printPositionId" = p."id"
  FROM "print_positions" p
 WHERE j."position" IS NOT NULL
   AND p."key" = CASE lower(j."position")
                   WHEN 'voorzijde'   THEN 'front'
                   WHEN 'achterzijde' THEN 'back'
                   WHEN 'zijkant'     THEN 'side'
                   WHEN 'deksel'      THEN 'lid'
                   WHEN 'onderzijde'  THEN 'bottom'
                   WHEN 'mouw'        THEN 'sleeve'
                   ELSE 'other'
                 END;
