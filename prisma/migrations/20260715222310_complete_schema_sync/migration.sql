-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentMethod" TEXT NOT NULL DEFAULT 'CASH',
ADD COLUMN     "stripePaymentId" TEXT,
ADD COLUMN     "stripeSessionUrl" TEXT,
ALTER COLUMN "status" SET DEFAULT 'UNPAID';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "adminLanguage" TEXT NOT NULL DEFAULT 'ro';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'ADMIN';
