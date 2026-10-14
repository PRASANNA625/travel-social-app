-- CreateEnum
CREATE TYPE "TripCategory" AS ENUM ('TRAVEL', 'SPORTS');

-- CreateEnum
CREATE TYPE "Sport" AS ENUM ('CRICKET', 'FOOTBALL', 'BADMINTON', 'TENNIS', 'VOLLEYBALL', 'BASKETBALL', 'CYCLING', 'RUNNING', 'SWIMMING', 'HIKING', 'GYM', 'OTHER');

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('ANY', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- AlterEnum
ALTER TYPE "JoinRequestStatus" ADD VALUE 'INVITED';

-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "category" "TripCategory" NOT NULL DEFAULT 'TRAVEL',
ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "skillLevel" "SkillLevel",
ADD COLUMN     "sport" "Sport";

-- CreateIndex
CREATE INDEX "Trip_category_idx" ON "Trip"("category");
