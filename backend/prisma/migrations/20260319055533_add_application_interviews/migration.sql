-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('ONLINE', 'ONSITE');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'INTERVIEW_SCHEDULED';
ALTER TYPE "ActivityType" ADD VALUE 'INTERVIEW_COMPLETED';
ALTER TYPE "ActivityType" ADD VALUE 'INTERVIEW_CANCELLED';

-- CreateTable
CREATE TABLE "ApplicationInterview" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "mode" "InterviewMode" NOT NULL,
    "meetingLink" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationInterview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationInterview_applicationId_idx" ON "ApplicationInterview"("applicationId");

-- AddForeignKey
ALTER TABLE "ApplicationInterview" ADD CONSTRAINT "ApplicationInterview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
