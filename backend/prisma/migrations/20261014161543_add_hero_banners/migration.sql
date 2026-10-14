-- CreateEnum
CREATE TYPE "HeroBannerStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "HeroMediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "HeroTextAlign" AS ENUM ('LEFT', 'CENTER', 'RIGHT');

-- CreateTable
CREATE TABLE "HeroBanner" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "HeroBannerStatus" NOT NULL DEFAULT 'DRAFT',
    "mediaType" "HeroMediaType" NOT NULL,
    "mediaUrl" TEXT NOT NULL,
    "mediaKey" TEXT,
    "posterUrl" TEXT,
    "posterKey" TEXT,
    "focalPoint" TEXT NOT NULL DEFAULT 'center',
    "heading" TEXT,
    "subtitle" TEXT,
    "tagline" TEXT,
    "textColor" TEXT NOT NULL DEFAULT '#FFFFFF',
    "overlayOpacity" DOUBLE PRECISION NOT NULL DEFAULT 0.45,
    "textAlign" "HeroTextAlign" NOT NULL DEFAULT 'LEFT',
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeroBanner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HeroBanner_status_displayOrder_idx" ON "HeroBanner"("status", "displayOrder");
