import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { ActivityType } from "@prisma/client";

export type CreateActivityParams = {
  applicationId: string;
  type: ActivityType;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
  /** "SYSTEM" | "RECRUITER"; defaults to "SYSTEM" if not provided. */
  actorType?: string | null;
  /** Optional recruiter id when actorType is RECRUITER. */
  actorId?: string | null;
};

/**
 * Inserts one ApplicationActivity row. Use this across the app whenever
 * an important application event occurs (created, answers submitted, AI evaluated, etc.).
 * Never throws: logs errors to console so activity logging cannot break the main flow.
 */
export async function createApplicationActivity(
  params: CreateActivityParams
): Promise<void> {
  const {
    applicationId,
    type,
    title,
    description,
    metadata,
    actorType = "SYSTEM",
    actorId,
  } = params;

  try {
    await prisma.applicationActivity.create({
      data: {
        applicationId,
        type,
        title,
        description,
        metadata:
          metadata == null ? undefined : (metadata as Prisma.InputJsonValue),
        actorType: actorType ?? "SYSTEM",
        actorId: actorId ?? undefined,
      },
    });
  } catch (err) {
    console.error("Activity log failed", err);
  }
}
