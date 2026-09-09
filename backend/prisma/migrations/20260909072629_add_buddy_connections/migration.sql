-- CreateEnum
CREATE TYPE "BuddyConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "BuddyConnection" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" "BuddyConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuddyConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuddyConnection_toUserId_status_idx" ON "BuddyConnection"("toUserId", "status");

-- CreateIndex
CREATE INDEX "BuddyConnection_fromUserId_status_idx" ON "BuddyConnection"("fromUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BuddyConnection_fromUserId_toUserId_key" ON "BuddyConnection"("fromUserId", "toUserId");

-- AddForeignKey
ALTER TABLE "BuddyConnection" ADD CONSTRAINT "BuddyConnection_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuddyConnection" ADD CONSTRAINT "BuddyConnection_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
