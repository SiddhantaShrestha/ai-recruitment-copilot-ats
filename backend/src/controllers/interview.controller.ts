import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { createApplicationActivity } from "../services/activity.service";

type UpdateInterviewStatusBody = { status?: string };

const VALID_INTERVIEW_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED"] as const;

/**
 * PATCH /api/interviews/:id/status
 * Updates interview status; logs INTERVIEW_COMPLETED or INTERVIEW_CANCELLED when applicable.
 */
export const updateInterviewStatus = async (
  req: Request<{ id: string }, {}, UpdateInterviewStatusBody>,
  res: Response
) => {
  try {
    const { id: interviewId } = req.params;
    const { status } = req.body;

    if (typeof status !== "string" || !status.trim()) {
      return res.status(400).json({
        success: false,
        message: "status is required",
      });
    }

    const normalizedStatus = status.toUpperCase();
    if (
      !(VALID_INTERVIEW_STATUSES as readonly string[]).includes(normalizedStatus)
    ) {
      return res.status(400).json({
        success: false,
        message: "status must be SCHEDULED, COMPLETED, or CANCELLED",
      });
    }

    const interview = await prisma.applicationInterview.findUnique({
      where: { id: interviewId },
      select: { id: true, applicationId: true, status: true },
    });

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: "Interview not found",
      });
    }

    const updated = await prisma.applicationInterview.update({
      where: { id: interviewId },
      data: { status: normalizedStatus as any },
    });

    const recruiterId = req.user!.id;
    if (normalizedStatus === "COMPLETED") {
      try {
        await createApplicationActivity({
          applicationId: interview.applicationId,
          type: "INTERVIEW_COMPLETED",
          title: "Interview Completed",
          description: "Interview marked as completed",
          actorType: "RECRUITER",
          actorId: recruiterId,
        });
      } catch (err) {
        console.error("Activity log failed", err);
      }
    } else if (normalizedStatus === "CANCELLED") {
      try {
        await createApplicationActivity({
          applicationId: interview.applicationId,
          type: "INTERVIEW_CANCELLED",
          title: "Interview Cancelled",
          description: "Interview was cancelled",
          actorType: "RECRUITER",
          actorId: recruiterId,
        });
      } catch (err) {
        console.error("Activity log failed", err);
      }
    }

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error("Update interview status error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
