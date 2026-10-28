-- AlterTable
ALTER TABLE "product_variants" ADD COLUMN     "colorCode" TEXT,
ADD COLUMN     "colorGroup" TEXT,
ADD COLUMN     "pmsColor" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "commodityCode" TEXT,
ADD COLUMN     "countryOfOrigin" TEXT,
ADD COLUMN     "dimensions" TEXT,
ADD COLUMN     "material" TEXT,
ADD COLUMN     "printable" BOOLEAN;
