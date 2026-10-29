-- CreateEnum
CREATE TYPE "PriceRuleMarginBasis" AS ENUM ('COST', 'SALE');

-- AlterTable
ALTER TABLE "price_rules" ADD COLUMN     "marginBasis" "PriceRuleMarginBasis" NOT NULL DEFAULT 'COST';
