-- CreateTable
CREATE TABLE "supplier_stock" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "variantId" UUID,
    "quantity" INTEGER NOT NULL,
    "firstArrivalDate" TIMESTAMP(3),
    "firstArrivalQuantity" INTEGER,
    "nextArrivalDate" TIMESTAMP(3),
    "nextArrivalQuantity" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_stock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_stock_variantId_idx" ON "supplier_stock"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_stock_connectionId_sku_key" ON "supplier_stock"("connectionId", "sku");

-- AddForeignKey
ALTER TABLE "supplier_stock" ADD CONSTRAINT "supplier_stock_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "supplier_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_stock" ADD CONSTRAINT "supplier_stock_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
