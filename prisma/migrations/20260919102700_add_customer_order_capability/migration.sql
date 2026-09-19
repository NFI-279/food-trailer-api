ALTER TABLE "Order" ADD COLUMN "customerAccessTokenHash" TEXT;

CREATE UNIQUE INDEX "Order_customerAccessTokenHash_key" ON "Order"("customerAccessTokenHash");
