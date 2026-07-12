-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "inventoryDeduction" DOUBLE PRECISION DEFAULT 1,
ADD COLUMN     "inventoryItemId" TEXT;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
