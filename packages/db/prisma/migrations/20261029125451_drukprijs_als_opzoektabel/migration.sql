-- AlterTable
ALTER TABLE "product_suppliers" ADD COLUMN     "minDecoQuantity" INTEGER;

-- CreateTable
CREATE TABLE "supplier_print_methods" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "printCode" TEXT NOT NULL,
    "description" TEXT,
    "ltmCharge" DECIMAL(14,4),
    "priceDependence" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_print_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_print_price_tiers" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "methodId" UUID NOT NULL,
    "logoSizeCm2" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "colors" INTEGER NOT NULL DEFAULT 0,
    "minQuantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,4) NOT NULL,
    "setupCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_print_price_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_print_methods_connectionId_printCode_key" ON "supplier_print_methods"("connectionId", "printCode");

-- CreateIndex
CREATE INDEX "supplier_print_price_tiers_connectionId_idx" ON "supplier_print_price_tiers"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_print_price_tiers_methodId_logoSizeCm2_colors_minQ_key" ON "supplier_print_price_tiers"("methodId", "logoSizeCm2", "colors", "minQuantity");

-- AddForeignKey
ALTER TABLE "supplier_print_methods" ADD CONSTRAINT "supplier_print_methods_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "supplier_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_print_price_tiers" ADD CONSTRAINT "supplier_print_price_tiers_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "supplier_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_print_price_tiers" ADD CONSTRAINT "supplier_print_price_tiers_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "supplier_print_methods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
