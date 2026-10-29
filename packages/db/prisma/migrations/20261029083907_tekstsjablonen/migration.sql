-- CreateEnum
CREATE TYPE "TemplateKind" AS ENUM ('QUOTE_INTRO', 'QUOTE_TERMS', 'QUOTE_LINE', 'QUOTE_EMAIL');

-- CreateTable
CREATE TABLE "document_templates" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "TemplateKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_key_key" ON "document_templates"("key");

-- CreateIndex
CREATE INDEX "document_templates_kind_idx" ON "document_templates"("kind");
