-- CreateEnum
CREATE TYPE "ConnectorTransport" AS ENUM ('REST', 'SOAP', 'XML_FEED', 'CSV_FEED', 'SFTP', 'FTP', 'FILE_UPLOAD');

-- CreateEnum
CREATE TYPE "ConnectorCapability" AS ENUM ('CATALOG', 'MEDIA', 'PRICE_TIERS', 'INVENTORY', 'PLACE_ORDER', 'ORDER_STATUS', 'SHIPPING');

-- CreateEnum
CREATE TYPE "ImportRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportItemStatus" AS ENUM ('OK', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "MappingDomain" AS ENUM ('CATEGORY', 'COLOR', 'SIZE', 'PRINT_METHOD', 'UNIT', 'CURRENCY');

-- CreateEnum
CREATE TYPE "StagedChangeType" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "StagedChangeStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProofDecision" AS ENUM ('APPROVED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'SENT', 'CONFIRMED', 'IN_PRODUCTION', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseInvoiceStatus" AS ENUM ('RECEIVED', 'MATCHED', 'CONTENT_APPROVED', 'FINANCE_APPROVED', 'DISPUTED', 'BOOKED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('PUBLIC', 'CUSTOMER', 'PARTNER');

-- CreateEnum
CREATE TYPE "PriceRuleScope" AS ENUM ('GLOBAL', 'SUPPLIER', 'CATEGORY', 'PRODUCT', 'CUSTOMER', 'CHANNEL');

-- CreateEnum
CREATE TYPE "FeedFormat" AS ENUM ('CSV', 'XML', 'JSON', 'GOOGLE_SHOPPING');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "proofId" UUID,
ADD COLUMN     "purchaseInvoiceId" UUID,
ADD COLUMN     "purchaseOrderId" UUID;

-- CreateTable
CREATE TABLE "supplier_connections" (
    "id" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "connectorKey" TEXT NOT NULL,
    "transport" "ConnectorTransport" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "credentials" BYTEA,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_connection_capabilities" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "capability" "ConnectorCapability" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "schedule" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_connection_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_runs" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "capability" "ConnectorCapability" NOT NULL,
    "status" "ImportRunStatus" NOT NULL DEFAULT 'PENDING',
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "itemsSeen" INTEGER NOT NULL DEFAULT 0,
    "itemsChanged" INTEGER NOT NULL DEFAULT 0,
    "itemsFailed" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "log" JSONB,

    CONSTRAINT "import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_items" (
    "id" UUID NOT NULL,
    "importRunId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" "ImportItemStatus" NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_supplier_products" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importRunId" UUID,

    CONSTRAINT "raw_supplier_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_mappings" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "targetField" TEXT NOT NULL,
    "transform" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "value_mappings" (
    "id" UUID NOT NULL,
    "connectionId" UUID NOT NULL,
    "domain" "MappingDomain" NOT NULL,
    "sourceValue" TEXT NOT NULL,
    "targetValue" TEXT NOT NULL,
    "targetId" UUID,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "value_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staged_changes" (
    "id" UUID NOT NULL,
    "importRunId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID,
    "externalId" TEXT,
    "changeType" "StagedChangeType" NOT NULL,
    "status" "StagedChangeStatus" NOT NULL DEFAULT 'PENDING',
    "diff" JSONB NOT NULL,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staged_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proofs" (
    "id" UUID NOT NULL,
    "orderLineId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ProofStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),
    "sentToCustomerAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proof_approvals" (
    "id" UUID NOT NULL,
    "proofId" UUID NOT NULL,
    "decision" "ProofDecision" NOT NULL,
    "decidedByUserId" UUID,
    "decidedByContactId" UUID,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "proof_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "supplierId" UUID NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "orderedAt" TIMESTAMP(3),
    "expectedDeliveryDate" TIMESTAMP(3),
    "reference" TEXT,
    "notes" TEXT,
    "totalExclVat" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "orderLineId" UUID,
    "productSupplierId" UUID,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quantityReceived" INTEGER NOT NULL DEFAULT 0,
    "unitPurchasePrice" DECIMAL(14,4) NOT NULL,
    "lineTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_confirmations" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "reference" TEXT,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDeliveryDate" TIMESTAMP(3),
    "payload" JSONB,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "supplier_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "purchaseOrderId" UUID NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "trackingCode" TEXT,
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_lines" (
    "id" UUID NOT NULL,
    "goodsReceiptId" UUID NOT NULL,
    "purchaseOrderLineId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoices" (
    "id" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "totalExclVat" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalInclVat" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "PurchaseInvoiceStatus" NOT NULL DEFAULT 'RECEIVED',
    "duplicateOfId" UUID,
    "contentApprovedById" UUID,
    "contentApprovedAt" TIMESTAMP(3),
    "financeApprovedById" UUID,
    "financeApprovedAt" TIMESTAMP(3),
    "bookedAt" TIMESTAMP(3),
    "sourcePayload" JSONB,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_invoice_lines" (
    "id" UUID NOT NULL,
    "purchaseInvoiceId" UUID NOT NULL,
    "purchaseOrderLineId" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unitPrice" DECIMAL(14,4) NOT NULL,
    "vatRate" DECIMAL(5,2) NOT NULL DEFAULT 21,
    "lineTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "purchase_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_channels" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "customerId" UUID,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shop_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_assortment_items" (
    "id" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "overrideUnitPrice" DECIMAL(14,4),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_assortment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_rules" (
    "id" UUID NOT NULL,
    "scope" "PriceRuleScope" NOT NULL,
    "supplierId" UUID,
    "categoryId" UUID,
    "productId" UUID,
    "customerId" UUID,
    "channelId" UUID,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "marginPercent" DECIMAL(6,2),
    "markupAmount" DECIMAL(14,4),
    "priority" INTEGER NOT NULL DEFAULT 100,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_exports" (
    "id" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" "FeedFormat" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "lastGeneratedAt" TIMESTAMP(3),
    "storageKey" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feed_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_accounts" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "channelId" UUID,
    "contactEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "partnerAccountId" UUID,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_connections_key_key" ON "supplier_connections"("key");

-- CreateIndex
CREATE INDEX "supplier_connections_supplierId_idx" ON "supplier_connections"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_connection_capabilities_capability_isEnabled_prior_idx" ON "supplier_connection_capabilities"("capability", "isEnabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_connection_capabilities_connectionId_capability_key" ON "supplier_connection_capabilities"("connectionId", "capability");

-- CreateIndex
CREATE INDEX "import_runs_connectionId_startedAt_idx" ON "import_runs"("connectionId", "startedAt");

-- CreateIndex
CREATE INDEX "import_runs_status_idx" ON "import_runs"("status");

-- CreateIndex
CREATE INDEX "import_items_importRunId_status_idx" ON "import_items"("importRunId", "status");

-- CreateIndex
CREATE INDEX "raw_supplier_products_hash_idx" ON "raw_supplier_products"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "raw_supplier_products_connectionId_externalId_key" ON "raw_supplier_products"("connectionId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "field_mappings_connectionId_targetField_sourcePath_key" ON "field_mappings"("connectionId", "targetField", "sourcePath");

-- CreateIndex
CREATE INDEX "value_mappings_domain_idx" ON "value_mappings"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "value_mappings_connectionId_domain_sourceValue_key" ON "value_mappings"("connectionId", "domain", "sourceValue");

-- CreateIndex
CREATE INDEX "staged_changes_importRunId_status_idx" ON "staged_changes"("importRunId", "status");

-- CreateIndex
CREATE INDEX "staged_changes_status_entityType_idx" ON "staged_changes"("status", "entityType");

-- CreateIndex
CREATE INDEX "proofs_status_idx" ON "proofs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "proofs_orderLineId_versionNumber_key" ON "proofs"("orderLineId", "versionNumber");

-- CreateIndex
CREATE INDEX "proof_approvals_proofId_idx" ON "proof_approvals"("proofId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_number_key" ON "purchase_orders"("number");

-- CreateIndex
CREATE INDEX "purchase_orders_supplierId_idx" ON "purchase_orders"("supplierId");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_order_lines_orderLineId_idx" ON "purchase_order_lines"("orderLineId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_lines_purchaseOrderId_lineNumber_key" ON "purchase_order_lines"("purchaseOrderId", "lineNumber");

-- CreateIndex
CREATE INDEX "supplier_confirmations_purchaseOrderId_idx" ON "supplier_confirmations"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "goods_receipts_purchaseOrderId_idx" ON "goods_receipts"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_goodsReceiptId_idx" ON "goods_receipt_lines"("goodsReceiptId");

-- CreateIndex
CREATE INDEX "goods_receipt_lines_purchaseOrderLineId_idx" ON "goods_receipt_lines"("purchaseOrderLineId");

-- CreateIndex
CREATE INDEX "purchase_invoices_status_idx" ON "purchase_invoices"("status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_invoices_supplierId_invoiceNumber_key" ON "purchase_invoices"("supplierId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "purchase_invoice_lines_purchaseInvoiceId_idx" ON "purchase_invoice_lines"("purchaseInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "shop_channels_key_key" ON "shop_channels"("key");

-- CreateIndex
CREATE INDEX "shop_channels_type_idx" ON "shop_channels"("type");

-- CreateIndex
CREATE INDEX "channel_assortment_items_channelId_isVisible_idx" ON "channel_assortment_items"("channelId", "isVisible");

-- CreateIndex
CREATE UNIQUE INDEX "channel_assortment_items_channelId_productId_key" ON "channel_assortment_items"("channelId", "productId");

-- CreateIndex
CREATE INDEX "price_rules_scope_isActive_priority_idx" ON "price_rules"("scope", "isActive", "priority");

-- CreateIndex
CREATE INDEX "price_rules_productId_idx" ON "price_rules"("productId");

-- CreateIndex
CREATE INDEX "price_rules_customerId_idx" ON "price_rules"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "feed_exports_key_key" ON "feed_exports"("key");

-- CreateIndex
CREATE INDEX "feed_exports_channelId_idx" ON "feed_exports"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_partnerAccountId_idx" ON "api_keys"("partnerAccountId");

-- CreateIndex
CREATE INDEX "documents_proofId_idx" ON "documents"("proofId");

-- CreateIndex
CREATE INDEX "documents_purchaseOrderId_idx" ON "documents"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "documents_purchaseInvoiceId_idx" ON "documents"("purchaseInvoiceId");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_proofId_fkey" FOREIGN KEY ("proofId") REFERENCES "proofs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_connections" ADD CONSTRAINT "supplier_connections_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_connection_capabilities" ADD CONSTRAINT "supplier_connection_capabilities_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "supplier_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "supplier_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_items" ADD CONSTRAINT "import_items_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_supplier_products" ADD CONSTRAINT "raw_supplier_products_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "supplier_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_supplier_products" ADD CONSTRAINT "raw_supplier_products_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_mappings" ADD CONSTRAINT "field_mappings_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "supplier_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "value_mappings" ADD CONSTRAINT "value_mappings_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "supplier_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staged_changes" ADD CONSTRAINT "staged_changes_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staged_changes" ADD CONSTRAINT "staged_changes_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proofs" ADD CONSTRAINT "proofs_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_approvals" ADD CONSTRAINT "proof_approvals_proofId_fkey" FOREIGN KEY ("proofId") REFERENCES "proofs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_approvals" ADD CONSTRAINT "proof_approvals_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proof_approvals" ADD CONSTRAINT "proof_approvals_decidedByContactId_fkey" FOREIGN KEY ("decidedByContactId") REFERENCES "contact_persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_productSupplierId_fkey" FOREIGN KEY ("productSupplierId") REFERENCES "product_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_confirmations" ADD CONSTRAINT "supplier_confirmations_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "purchase_order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "purchase_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_contentApprovedById_fkey" FOREIGN KEY ("contentApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_financeApprovedById_fkey" FOREIGN KEY ("financeApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_purchaseInvoiceId_fkey" FOREIGN KEY ("purchaseInvoiceId") REFERENCES "purchase_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_invoice_lines" ADD CONSTRAINT "purchase_invoice_lines_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "purchase_order_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_channels" ADD CONSTRAINT "shop_channels_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_assortment_items" ADD CONSTRAINT "channel_assortment_items_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "shop_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_assortment_items" ADD CONSTRAINT "channel_assortment_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "product_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "shop_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_exports" ADD CONSTRAINT "feed_exports_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "shop_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_accounts" ADD CONSTRAINT "partner_accounts_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "shop_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_partnerAccountId_fkey" FOREIGN KEY ("partnerAccountId") REFERENCES "partner_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
