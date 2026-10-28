-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "paymentTermId" UUID;

-- CreateTable
CREATE TABLE "payment_terms" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "days" INTEGER NOT NULL DEFAULT 30,
    "endOfMonth" BOOLEAN NOT NULL DEFAULT false,
    "prepaymentPercent" DECIMAL(5,2),
    "invoiceText" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_price_agreements" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,4) NOT NULL,
    "note" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_price_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_terms_key_key" ON "payment_terms"("key");

-- CreateIndex
CREATE INDEX "payment_terms_isActive_sort_idx" ON "payment_terms"("isActive", "sort");

-- CreateIndex
CREATE INDEX "customer_price_agreements_customerId_isActive_idx" ON "customer_price_agreements"("customerId", "isActive");

-- CreateIndex
CREATE INDEX "customer_price_agreements_productId_idx" ON "customer_price_agreements"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_price_agreements_customerId_productId_minQuantity_key" ON "customer_price_agreements"("customerId", "productId", "minQuantity");

-- CreateIndex
CREATE INDEX "customers_paymentTermId_idx" ON "customers"("paymentTermId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "payment_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_price_agreements" ADD CONSTRAINT "customer_price_agreements_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_price_agreements" ADD CONSTRAINT "customer_price_agreements_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
