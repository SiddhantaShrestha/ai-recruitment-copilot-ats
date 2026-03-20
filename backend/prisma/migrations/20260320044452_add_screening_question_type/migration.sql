-- CreateEnum
CREATE TYPE "ScreeningQuestionType" AS ENUM ('TEXT', 'YES_NO', 'NUMBER');

-- AlterTable
ALTER TABLE "ScreeningQuestion" ADD COLUMN     "type" "ScreeningQuestionType" NOT NULL DEFAULT 'TEXT';
