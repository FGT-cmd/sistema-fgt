-- AlterTable
ALTER TABLE "User" ADD COLUMN     "googleAccessToken" TEXT,
ADD COLUMN     "googleRefreshToken" TEXT,
ADD COLUMN     "googleTokenExpiry" TIMESTAMP(3);
