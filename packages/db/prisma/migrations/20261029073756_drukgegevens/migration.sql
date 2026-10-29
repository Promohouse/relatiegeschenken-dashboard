-- AlterEnum
ALTER TYPE "ConnectorCapability" ADD VALUE 'PRINT_DATA';

-- AlterTable
ALTER TABLE "product_print_options" ADD COLUMN     "maxPrintHeightMm" DECIMAL(10,2),
ADD COLUMN     "maxPrintWidthMm" DECIMAL(10,2),
ADD COLUMN     "supplierTechniqueCode" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "printManipulationCode" TEXT;

-- CreateTable
CREATE TABLE "supplier_print_techniques" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricingType" TEXT NOT NULL,
    "setup" DECIMAL(14,4),
    "setupRepeat" DECIMAL(14,4),
    "nextColourCostIndicator" BOOLEAN NOT NULL DEFAULT false,
    "varCosts" JSONB NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_print_techniques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_print_manipulations" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "pricePerPiece" DECIMAL(14,4) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_print_manipulations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_print_techniques_connectionId_code_key" ON "supplier_print_techniques"("connectionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_print_manipulations_connectionId_code_key" ON "supplier_print_manipulations"("connectionId", "code");

-- AddForeignKey
ALTER TABLE "supplier_print_techniques" ADD CONSTRAINT "supplier_print_techniques_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "supplier_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_print_manipulations" ADD CONSTRAINT "supplier_print_manipulations_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "supplier_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
