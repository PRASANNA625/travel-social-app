-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('REPORT', 'FEEDBACK');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'RESOLVED');

-- CreateTable
CREATE TABLE "AppFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "FeedbackKind" NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "screenshotUrl" TEXT,
    "appVersion" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppFeedback_userId_idx" ON "AppFeedback"("userId");

-- CreateIndex
CREATE INDEX "AppFeedback_status_idx" ON "AppFeedback"("status");

-- AddForeignKey
ALTER TABLE "AppFeedback" ADD CONSTRAINT "AppFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
