-- ADR-0007: offertes worden een eigen aggregaat met onveranderlijke versies.
--
-- DATASANERING VOORAF
-- Tot nu toe waren offerte en order één tabel: `orders` met kind = 'QUOTE'.
-- Die offerte-orders horen vanaf nu in `quotes` en worden opnieuw gezaaid.
-- Ze moeten hier verdwijnen omdat de enumwaarden QUOTE_SENT, QUOTE_ACCEPTED
-- en QUOTE_REJECTED uit OrderStatus worden gehaald; de enumconversie verderop
-- faalt zolang die waarden nog in gebruik zijn.
--
-- Op een lege database en op elke database zonder offerte-orders is dit een
-- no-op. Er is op dit moment geen productiedata.
DELETE FROM "orders" WHERE "kind" = 'QUOTE';

-- Vangnet: een order zonder kind = 'QUOTE' die toch een offertestatus heeft,
-- wordt naar DRAFT gezet in plaats van de migratie te laten falen.
UPDATE "orders" SET "status" = 'DRAFT'
 WHERE "status" IN ('QUOTE_SENT', 'QUOTE_ACCEPTED', 'QUOTE_REJECTED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'READY_TO_SEND', 'SENT', 'AWAITING_CUSTOMER', 'CHANGES_REQUESTED', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "QuoteDecision" AS ENUM ('ACCEPTED', 'REJECTED', 'CHANGES_REQUESTED');

-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');
ALTER TABLE "public"."orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orders" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- DropForeignKey
ALTER TABLE "orders" DROP CONSTRAINT "orders_convertedFromOrderId_fkey";

-- DropIndex
DROP INDEX "orders_convertedFromOrderId_key";

-- DropIndex
DROP INDEX "orders_kind_status_idx";

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "quoteId" UUID,
ADD COLUMN     "quoteVersionId" UUID;

-- AlterTable
ALTER TABLE "order_lines" ADD COLUMN     "quoteItemId" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "convertedFromOrderId",
DROP COLUMN "kind",
ADD COLUMN     "quoteVersionId" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "quoteId" UUID;

-- DropEnum
DROP TYPE "OrderKind";

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "contactPersonId" UUID,
    "ownerId" UUID,
    "invoiceAddressId" UUID,
    "deliveryAddressId" UUID,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" UUID,
    "acceptedVersionId" UUID,
    "requestedDeliveryDate" TIMESTAMP(3),
    "reference" TEXT,
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_versions" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "validUntil" TIMESTAMP(3),
    "vatRegime" "VatRegime" NOT NULL DEFAULT 'DOMESTIC',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "subtotalExclVat" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalInclVat" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "purchaseTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "marginAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deliveryTerms" TEXT,
    "customerNotes" TEXT,
    "createdById" UUID,
    "sentAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "documentChecksum" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" UUID NOT NULL,
    "quoteVersionId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productId" UUID,
    "productVariantId" UUID,
    "productSupplierId" UUID,
    "supplierId" UUID,
    "productArticleNumber" TEXT,
    "productName" TEXT NOT NULL,
    "variantDescription" TEXT,
    "supplierName" TEXT,
    "description" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitSalePrice" DECIMAL(14,4) NOT NULL,
    "unitPurchasePrice" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "setupCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 21,
    "lineSubtotalExclVat" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineVatAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotalInclVat" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "linePurchaseTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineMarginAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_item_print_jobs" (
    "id" UUID NOT NULL,
    "quoteItemId" UUID NOT NULL,
    "printMethodId" UUID,
    "printMethodName" TEXT NOT NULL,
    "position" TEXT,
    "colors" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "setupCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_item_print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_approvals" (
    "id" UUID NOT NULL,
    "quoteVersionId" UUID NOT NULL,
    "decision" "QuoteDecision" NOT NULL,
    "decidedByUserId" UUID,
    "decidedByContactId" UUID,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "documentChecksum" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "quote_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotes_number_key" ON "quotes"("number");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_currentVersionId_key" ON "quotes"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_acceptedVersionId_key" ON "quotes"("acceptedVersionId");

-- CreateIndex
CREATE INDEX "quotes_customerId_idx" ON "quotes"("customerId");

-- CreateIndex
CREATE INDEX "quotes_status_idx" ON "quotes"("status");

-- CreateIndex
CREATE INDEX "quotes_ownerId_idx" ON "quotes"("ownerId");

-- CreateIndex
CREATE INDEX "quote_versions_quoteId_idx" ON "quote_versions"("quoteId");

-- CreateIndex
CREATE INDEX "quote_versions_lockedAt_idx" ON "quote_versions"("lockedAt");

-- CreateIndex
CREATE UNIQUE INDEX "quote_versions_quoteId_versionNumber_key" ON "quote_versions"("quoteId", "versionNumber");

-- CreateIndex
CREATE INDEX "quote_items_quoteVersionId_idx" ON "quote_items"("quoteVersionId");

-- CreateIndex
CREATE INDEX "quote_items_productId_idx" ON "quote_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "quote_items_quoteVersionId_lineNumber_key" ON "quote_items"("quoteVersionId", "lineNumber");

-- CreateIndex
CREATE INDEX "quote_item_print_jobs_quoteItemId_idx" ON "quote_item_print_jobs"("quoteItemId");

-- CreateIndex
CREATE UNIQUE INDEX "quote_approvals_idempotencyKey_key" ON "quote_approvals"("idempotencyKey");

-- CreateIndex
CREATE INDEX "quote_approvals_quoteVersionId_idx" ON "quote_approvals"("quoteVersionId");

-- CreateIndex
CREATE INDEX "documents_quoteId_idx" ON "documents"("quoteId");

-- CreateIndex
CREATE INDEX "documents_quoteVersionId_idx" ON "documents"("quoteVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_quoteVersionId_key" ON "orders"("quoteVersionId");

-- CreateIndex
CREATE INDEX "tasks_quoteId_idx" ON "tasks"("quoteId");

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_contactPersonId_fkey" FOREIGN KEY ("contactPersonId") REFERENCES "contact_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_invoiceAddressId_fkey" FOREIGN KEY ("invoiceAddressId") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_deliveryAddressId_fkey" FOREIGN KEY ("deliveryAddressId") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "quote_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_acceptedVersionId_fkey" FOREIGN KEY ("acceptedVersionId") REFERENCES "quote_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quoteVersionId_fkey" FOREIGN KEY ("quoteVersionId") REFERENCES "quote_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_productSupplierId_fkey" FOREIGN KEY ("productSupplierId") REFERENCES "product_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_item_print_jobs" ADD CONSTRAINT "quote_item_print_jobs_quoteItemId_fkey" FOREIGN KEY ("quoteItemId") REFERENCES "quote_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_item_print_jobs" ADD CONSTRAINT "quote_item_print_jobs_printMethodId_fkey" FOREIGN KEY ("printMethodId") REFERENCES "print_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_approvals" ADD CONSTRAINT "quote_approvals_quoteVersionId_fkey" FOREIGN KEY ("quoteVersionId") REFERENCES "quote_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_approvals" ADD CONSTRAINT "quote_approvals_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_approvals" ADD CONSTRAINT "quote_approvals_decidedByContactId_fkey" FOREIGN KEY ("decidedByContactId") REFERENCES "contact_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_quoteVersionId_fkey" FOREIGN KEY ("quoteVersionId") REFERENCES "quote_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_quoteItemId_fkey" FOREIGN KEY ("quoteItemId") REFERENCES "quote_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_quoteVersionId_fkey" FOREIGN KEY ("quoteVersionId") REFERENCES "quote_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

