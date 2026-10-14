-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "removedAt" TIMESTAMP(3),
ADD COLUMN     "removedById" TEXT;

-- AlterTable
ALTER TABLE "UserReport" ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "messageSnapshot" JSONB;

-- CreateIndex
CREATE INDEX "UserReport_messageId_idx" ON "UserReport"("messageId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserReport" ADD CONSTRAINT "UserReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
