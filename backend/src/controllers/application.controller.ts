import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { CreateApplicationBody } from "../types/application.types";
import { triggerApplicationWorkflow } from "../services/workflow.service";
import { evaluateApplicationWithAI } from "../services/ai-evaluation.service";
import { triggerOpenClawWorkflow } from "../services/openclaw.service";
import { createApplicationActivity } from "../services/activity.service";
import {
  submitApplicationAnswersInternal,
  type ScreeningAnswerInput,
  ApplicationAnswersError,
} from "../services/application-answers.service";

/**
 * Application pipeline status flow:
 * - APPLIED -> SCREENED -> SHORTLISTED -> INTERVIEW -> OFFER -> HIRED
 * - Terminal: REJECTED, HIRED
 *
 * Backward compatible behavior:
 * - Legacy statuses SCREENING_PENDING / SCREENING_IN_PROGRESS are treated as SCREENED.
 */
const NEW_STATUSES = [
  "APPLIED",
  "SCREENED",
  "SHORTLISTED",
  "INTERVIEW",
  "OFFER",
  "HIRED",
  "REJECTED",
] as const;

type ApplicationPipelineStatus = (typeof NEW_STATUSES)[number];

const LEGACY_STATUS_ALIAS: Record<string, ApplicationPipelineStatus> = {
  SCREENING_PENDING: "SCREENED",
  SCREENING_IN_PROGRESS: "SCREENED",
};

function normalizeApplicationStatus(
  input: string
): ApplicationPipelineStatus | null {
  if ((NEW_STATUSES as readonly string[]).includes(input)) {
    return input as ApplicationPipelineStatus;
  }
  if (input in LEGACY_STATUS_ALIAS) {
    return LEGACY_STATUS_ALIAS[input];
  }
  return null;
}

function mapAiRecommendationToStatus(
  recommendation: string | null
): ApplicationPipelineStatus {
  if (recommendation === "REJECT") return "REJECTED";
  if (recommendation === "SHORTLIST") return "SHORTLISTED";
  return "SCREENED"; // MAYBE -> SCREENED (and any unexpected value)
}

export const createApplication = async (
  req: Request<{}, {}, CreateApplicationBody>,
  res: Response
) => {
  try {
    const { fullName, email, phone, resumeUrl, jobId } = req.body;

    if (!fullName || !email || !jobId) {
      return res.status(400).json({
        success: false,
        message: "fullName, email, and jobId are required",
      });
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    let candidate = await prisma.candidate.findUnique({
      where: { email },
    });

    if (!candidate) {
      candidate = await prisma.candidate.create({
        data: {
          fullName,
          email,
          phone,
          resumeUrl,
        },
      });
    } else {
      candidate = await prisma.candidate.update({
        where: { email },
        data: {
          fullName,
          phone,
          resumeUrl,
        },
      });
    }

    const existingApplication = await prisma.application.findUnique({
      where: {
        candidateId_jobId: {
          candidateId: candidate.id,
          jobId,
        },
      },
    });

    if (existingApplication) {
      return res.status(409).json({
        success: false,
        message: "Candidate has already applied for this job",
      });
    }

    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        jobId,
        status: "APPLIED",
      },
      include: {
        candidate: true,
        job: true,
      },
    });

    try {
      await createApplicationActivity({
        applicationId: application.id,
        type: "APPLIED",
        title: "Applied",
        description: "Application submitted",
      });
    } catch (err) {
      console.error("Activity log failed", err);
    }
    await triggerApplicationWorkflow(application.id);

    return res.status(201).json({
      success: true,
      message: "Application created successfully",
      data: application,
    });
  } catch (error) {
    console.error("Create application error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

type InternalCreateApplicationBody = {
  fullName?: string;
  email?: string;
  phone?: string;
  resumeUrl?: string;
  jobId?: string;
  answers?: Array<{
    screeningQuestionId?: string;
    answer?: string;
  }>;
};

/**
 * Internal admin flow:
 * - create candidate + application
 * - if job has screening questions, save answers
 * - trigger AI evaluation and ATS status update via the existing logic
 */
export const internalCreateApplication = async (
  req: Request<{}, {}, InternalCreateApplicationBody>,
  res: Response
) => {
  try {
    const { fullName, email, phone, resumeUrl, jobId, answers } = req.body;

    if (!fullName || !email || !jobId) {
      return res.status(400).json({
        success: false,
        message: "fullName, email, and jobId are required",
      });
    }

    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Job not found",
      });
    }

    let candidate = await prisma.candidate.findUnique({
      where: { email },
    });

    if (!candidate) {
      candidate = await prisma.candidate.create({
        data: {
          fullName,
          email,
          phone,
          resumeUrl,
        },
      });
    } else {
      candidate = await prisma.candidate.update({
        where: { email },
        data: {
          fullName,
          phone,
          resumeUrl,
        },
      });
    }

    const existingApplication = await prisma.application.findUnique({
      where: {
        candidateId_jobId: {
          candidateId: candidate.id,
          jobId,
        },
      },
    });

    if (existingApplication) {
      return res.status(409).json({
        success: false,
        message: "Candidate has already applied for this job",
      });
    }

    const application = await prisma.application.create({
      data: {
        candidateId: candidate.id,
        jobId,
        status: "APPLIED",
      },
      include: {
        candidate: true,
        job: true,
      },
    });

    await createApplicationActivity({
      applicationId: application.id,
      type: "APPLIED" as any,
      title: "Applied",
      description: "Application submitted",
    });

    await triggerApplicationWorkflow(application.id);

    const screeningQuestions = await prisma.screeningQuestion.findMany({
      where: { jobId },
      orderBy: { order: "asc" },
      select: { id: true },
    });

    // No screening questions -> create application only.
    if (screeningQuestions.length === 0) {
      return res.status(201).json({
        success: true,
        message: "Application created successfully",
        data: application,
      });
    }

    // Job has screening questions -> require complete answers.
    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "This job has screening questions. You must provide answers for all questions.",
      });
    }

    const normalizedAnswers: ScreeningAnswerInput[] = answers.map((a) => ({
      screeningQuestionId: String(a.screeningQuestionId ?? ""),
      answer: String(a.answer ?? ""),
    }));

    for (const a of normalizedAnswers) {
      if (!a.screeningQuestionId || !a.answer.trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Each answer must include screeningQuestionId and a non-empty answer",
        });
      }
    }

    const expectedIds = screeningQuestions.map((q) => q.id).sort();
    const providedIds = normalizedAnswers
      .map((a) => a.screeningQuestionId)
      .sort();

    if (
      expectedIds.length !== providedIds.length ||
      expectedIds.some((id, idx) => id !== providedIds[idx])
    ) {
      return res.status(400).json({
        success: false,
        message:
          "You must provide answers for all screening questions (complete set).",
      });
    }

    const updatedApplication = await submitApplicationAnswersInternal({
      applicationId: application.id,
      candidateId: candidate.id,
      answers: normalizedAnswers,
    });

    return res.status(201).json({
      success: true,
      data: updatedApplication,
    });
  } catch (error) {
    if (error instanceof ApplicationAnswersError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Internal create application error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

type GetApplicationsQuery = {
  search?: string;
  status?: string;
  jobId?: string;
  recommendation?: string;
  scoreMin?: string;
  page?: string;
  limit?: string;
};

export const getApplications = async (
  req: Request<{}, {}, {}, GetApplicationsQuery>,
  res: Response
) => {
  try {
    const {
      search,
      status,
      jobId,
      recommendation,
      scoreMin,
      page: pageRaw,
      limit: limitRaw,
    } = req.query;

    const page = Math.max(1, Number(pageRaw) || 1);
    const parsedLimit = Number(limitRaw) || 10;
    const limit = Math.min(100, Math.max(1, parsedLimit));
    const skip = (page - 1) * limit;

    const where: Prisma.ApplicationWhereInput = {};

    if (search?.trim()) {
      const query = search.trim();
      where.OR = [
        {
          candidate: {
            fullName: {
              contains: query,
              mode: "insensitive",
            },
          },
        },
        {
          candidate: {
            email: {
              contains: query,
              mode: "insensitive",
            },
          },
        },
      ];
    }

    if (status?.trim()) {
      const normalized = normalizeApplicationStatus(status.trim());
      if (!normalized) {
        return res.status(400).json({
          success: false,
          message: "Invalid status filter",
        });
      }
      where.status = normalized as any;
    }

    if (jobId?.trim()) {
      where.jobId = jobId.trim();
    }

    if (recommendation?.trim()) {
      where.aiRecommendation = recommendation.trim();
    }

    if (scoreMin?.trim()) {
      const minScore = Number(scoreMin);
      if (!Number.isFinite(minScore)) {
        return res.status(400).json({
          success: false,
          message: "scoreMin must be a valid number",
        });
      }
      where.aiScore = { gte: minScore };
    }

    const [total, applications] = await Promise.all([
      prisma.application.count({ where }),
      prisma.application.findMany({
        where,
        include: {
          candidate: true,
          job: true,
          answers: {
            include: {
              screeningQuestion: true,
            },
          },
        },
        orderBy: {
          appliedAt: "desc",
        },
        skip,
        take: limit,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.status(200).json({
      success: true,
      data: applications,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Get applications error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

type UpdateApplicationStatusBody = { status?: string };

export const updateApplicationStatus = async (
  req: Request<{ id: string }, {}, UpdateApplicationStatusBody>,
  res: Response
) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (typeof status !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const normalizedStatus = normalizeApplicationStatus(status);
    if (!normalizedStatus) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const existingApplication = await prisma.application.findUnique({
      where: { id },
      include: {
        candidate: true,
        job: true,
      },
    });

    if (!existingApplication) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    const previousStatus = normalizeApplicationStatus(existingApplication.status);

    const updatedApplication = await prisma.application.update({
      where: { id },
      // normalizedStatus is already validated/normalized; cast keeps Prisma types aligned.
      data: { status: normalizedStatus as any },
      include: {
        candidate: true,
        job: true,
      },
    });

    try {
      await createApplicationActivity({
        applicationId: id,
        type: "STATUS_CHANGED",
        title: "Status Changed",
        description: "Status updated",
        metadata: {
          from: previousStatus ?? existingApplication.status,
          to: normalizedStatus,
        },
      });
    } catch (err) {
      console.error("Activity log failed", err);
    }

    return res.status(200).json({
      success: true,
      data: updatedApplication,
    });
  } catch (error) {
    console.error("Update application status error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

type MoveApplicationStatusBody = {
  status?: string;
};

// Allowed recruiter transitions between pipeline stages.
const ALLOWED_MOVES: Record<
  ApplicationPipelineStatus,
  ApplicationPipelineStatus[]
> = {
  APPLIED: ["SCREENED"],
  SCREENED: ["SHORTLISTED", "REJECTED"],
  SHORTLISTED: ["INTERVIEW", "REJECTED"],
  INTERVIEW: ["OFFER", "REJECTED"],
  OFFER: ["HIRED", "REJECTED"],
  // Terminal states (no further moves).
  HIRED: [],
  REJECTED: [],
};

function assertValidMove(
  current: ApplicationPipelineStatus,
  next: ApplicationPipelineStatus
) {
  // Terminal states cannot move.
  if (current === "HIRED" || current === "REJECTED") return false;
  // Disallow no-op moves (same status).
  if (current === next) return false;

  return ALLOWED_MOVES[current]?.includes(next) ?? false;
}

export const moveApplicationStatus = async (
  req: Request<{ id: string }, {}, MoveApplicationStatusBody>,
  res: Response
) => {
  try {
    // 1) Parse inputs.
    const { id } = req.params;
    const { status } = req.body;

    // 2) Validate requested status exists in the enum.
    if (typeof status !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    const normalizedStatus = normalizeApplicationStatus(status);
    if (!normalizedStatus) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      });
    }

    // 3) Validate application exists and fetch payload needed for OpenClaw.
    const existingApplication = await prisma.application.findUnique({
      where: { id },
      include: {
        candidate: true,
        job: true,
        answers: {
          include: {
            screeningQuestion: true,
          },
        },
      },
    });

    if (!existingApplication) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    // 4) Validate pipeline transition.
    const currentStatus = normalizeApplicationStatus(existingApplication.status);
    if (!currentStatus) {
      // If DB contains unexpected legacy values, fail safe.
      return res.status(400).json({
        success: false,
        message: "Invalid status transition",
      });
    }

    const isValidMove = assertValidMove(currentStatus, normalizedStatus);
    if (!isValidMove) {
      return res.status(400).json({
        success: false,
        message: "Invalid status transition",
      });
    }

    // 5) Update application status in DB.
    const updatedApplication = await prisma.application.update({
      where: { id },
      data: { status: normalizedStatus as any },
      include: {
        candidate: true,
        job: true,
        answers: {
          include: {
            screeningQuestion: true,
          },
        },
      },
    });

    const recruiterId = req.user!.id;
    await createApplicationActivity({
      applicationId: id,
      type: "STATUS_CHANGED",
      title: "Status Changed",
      description: "Status updated",
      metadata: { from: currentStatus, to: normalizedStatus },
      actorType: "RECRUITER",
      actorId: recruiterId,
    });

    // 6) Trigger OpenClaw workflow after status update; log only on success.
    try {
      await triggerOpenClawWorkflow(updatedApplication);
      await createApplicationActivity({
        applicationId: id,
        type: "OPENCLAW_TRIGGERED",
        title: "OpenClaw Triggered",
        description: "OpenClaw workflow triggered successfully",
        actorType: "SYSTEM",
      });
      await createApplicationActivity({
        applicationId: id,
        type: "TELEGRAM_SENT",
        title: "Telegram Notification Sent",
        description: "Recruiter notification sent successfully",
        actorType: "SYSTEM",
      });
    } catch (openClawErr) {
      console.error("OpenClaw workflow failed", openClawErr);
    }

    return res.status(200).json({
      success: true,
      data: updatedApplication,
    });
  } catch (error) {
    console.error("Move application status error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

type BulkMoveBody = {
  applicationIds?: string[];
  status?: string;
};

/**
 * PATCH /api/applications/bulk-move
 * Update status for multiple applications. Uses same transition rules as single move.
 * Invalid applications are skipped and reported; request does not fail entirely.
 */
export const bulkMoveApplications = async (
  req: Request<{}, {}, BulkMoveBody>,
  res: Response
) => {
  try {
    const { applicationIds, status } = req.body;

    if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "applicationIds must be a non-empty array",
      });
    }

    const normalizedStatus = normalizeApplicationStatus(
      typeof status === "string" ? status : ""
    );
    if (!normalizedStatus) {
      return res.status(400).json({
        success: false,
        message: "status is required and must be a valid application status",
      });
    }

    const uniqueIds = [...new Set(applicationIds)].filter(
      (id): id is string => typeof id === "string" && id.trim() !== ""
    );

    const applicationInclude = {
      candidate: true,
      job: true,
      answers: {
        include: {
          screeningQuestion: true,
        },
      },
    } as const;

    const updatedIds: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];

    for (const id of uniqueIds) {
      const existing = await prisma.application.findUnique({
        where: { id },
        include: applicationInclude,
      });

      if (!existing) {
        skipped.push({ id, reason: "Application not found" });
        continue;
      }

      const currentStatus = normalizeApplicationStatus(existing.status);
      if (!currentStatus) {
        skipped.push({ id, reason: "Invalid current status" });
        continue;
      }

      if (!assertValidMove(currentStatus, normalizedStatus)) {
        skipped.push({ id, reason: "Invalid status transition" });
        continue;
      }

      const updated = await prisma.application.update({
        where: { id },
        data: { status: normalizedStatus as any },
        include: applicationInclude,
      });

      const recruiterId = req.user!.id;
      try {
        await createApplicationActivity({
          applicationId: id,
          type: "STATUS_CHANGED",
          title: "Status Changed",
          description: "Status updated",
          metadata: { from: currentStatus, to: normalizedStatus },
          actorType: "RECRUITER",
          actorId: recruiterId,
        });
      } catch (err) {
        console.error("Activity log failed", err);
      }

      try {
        await triggerOpenClawWorkflow(updated);
        await createApplicationActivity({
          applicationId: id,
          type: "OPENCLAW_TRIGGERED",
          title: "OpenClaw Triggered",
          description: "OpenClaw workflow triggered successfully",
          actorType: "SYSTEM",
        });
        await createApplicationActivity({
          applicationId: id,
          type: "TELEGRAM_SENT",
          title: "Telegram Notification Sent",
          description: "Recruiter notification sent successfully",
          actorType: "SYSTEM",
        });
      } catch (openClawErr) {
        console.error("OpenClaw workflow failed", openClawErr);
      }

      updatedIds.push(id);
    }

    return res.status(200).json({
      success: true,
      data: {
        updatedCount: updatedIds.length,
        skippedCount: skipped.length,
        updatedIds,
        skipped,
      },
    });
  } catch (error) {
    console.error("Bulk move applications error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

type SubmitApplicationAnswersBody = {
  candidateId?: string;
  answers?: Array<{
    screeningQuestionId?: string;
    answer?: string;
  }>;
};

export const submitApplicationAnswers = async (
  req: Request<{ applicationId: string }, {}, SubmitApplicationAnswersBody>,
  res: Response
) => {
  try {
    const { applicationId } = req.params;
    const { candidateId, answers } = req.body;

    if (!candidateId) {
      return res.status(400).json({
        success: false,
        message: "candidateId is required",
      });
    }

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "answers must be a non-empty array",
      });
    }

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        candidate: true,
        job: true,
      },
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    if (application.candidateId !== candidateId) {
      return res.status(400).json({
        success: false,
        message: "candidateId does not match this application",
      });
    }

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      return res.status(404).json({
        success: false,
        message: "Candidate not found",
      });
    }

    const normalizedAnswers = answers.map((a) => ({
      screeningQuestionId: a.screeningQuestionId,
      answer: a.answer,
    }));

    for (const a of normalizedAnswers) {
      if (!a.screeningQuestionId || !a.answer) {
        return res.status(400).json({
          success: false,
          message:
            "Each answer must include screeningQuestionId and answer",
        });
      }
    }

    const screeningQuestionIds = normalizedAnswers.map(
      (a) => a.screeningQuestionId as string
    );

    const screeningQuestions = await prisma.screeningQuestion.findMany({
      where: {
        id: { in: screeningQuestionIds },
      },
    });

    if (screeningQuestions.length !== screeningQuestionIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more screening questions not found",
      });
    }

    const invalidQuestion = screeningQuestions.find(
      (q: { jobId: string }) => q.jobId !== application.jobId
    );

    if (invalidQuestion) {
      return res.status(400).json({
        success: false,
        message:
          "One or more screening questions do not belong to this job",
      });
    }

    const createdAnswers = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Remove previous answers to prevent duplicates for this application.
        await tx.screeningAnswer.deleteMany({
          where: { applicationId },
        });

        return Promise.all(
          normalizedAnswers.map((a) =>
            tx.screeningAnswer.create({
              data: {
                applicationId,
                candidateId,
                screeningQuestionId: a.screeningQuestionId as string,
                answer: a.answer as string,
              },
            })
          )
        );
      }
    );

    try {
      await createApplicationActivity({
        applicationId,
        type: "ANSWERS_SUBMITTED",
        title: "Answers Submitted",
        description: `${createdAnswers.length} answers received`,
      });
    } catch (err) {
      console.error("Activity log failed", err);
    }

    // AI evaluation (updates aiScore/aiSummary/aiRecommendation).
    const aiEvaluatedApplication = await evaluateApplicationWithAI(
      applicationId
    );

    try {
      await createApplicationActivity({
        applicationId,
        type: "AI_EVALUATED",
        title: "AI Evaluated",
        description: "AI evaluation completed",
        metadata: {
          aiScore: aiEvaluatedApplication.aiScore,
          aiRecommendation: aiEvaluatedApplication.aiRecommendation,
        },
      });
    } catch (err) {
      console.error("Activity log failed", err);
    }

    const nextStatus = mapAiRecommendationToStatus(
      aiEvaluatedApplication.aiRecommendation
    );
    const statusBeforeUpdate = normalizeApplicationStatus(application.status);

    const updatedApplication = await prisma.application.update({
      where: { id: applicationId },
      data: { status: nextStatus as any },
      include: {
        candidate: true,
        job: true,
        answers: {
          include: {
            screeningQuestion: true,
          },
        },
      },
    });

    try {
      await createApplicationActivity({
        applicationId,
        type: "STATUS_CHANGED",
        title: "Status Changed",
        description: "Status updated",
        metadata: {
          from: statusBeforeUpdate ?? application.status,
          to: nextStatus,
        },
      });
    } catch (err) {
      console.error("Activity log failed", err);
    }

    try {
      await triggerOpenClawWorkflow(updatedApplication);
      await createApplicationActivity({
        applicationId,
        type: "OPENCLAW_TRIGGERED",
        title: "OpenClaw Triggered",
        description: "OpenClaw workflow triggered successfully",
      });
      await createApplicationActivity({
        applicationId,
        type: "TELEGRAM_SENT",
        title: "Telegram Notification Sent",
        description: "Recruiter notification sent successfully",
      });
    } catch (openClawErr) {
      console.error("OpenClaw workflow failed", openClawErr);
    }

    return res.status(201).json({
      success: true,
      data: updatedApplication,
    });
  } catch (error) {
    console.error("Submit application answers error:", error);

    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("GEMINI_API_KEY")) {
      return res.status(500).json({
        success: false,
        message: "AI evaluation is not configured",
      });
    }

    if (message.includes("Gemini") || message.includes("parse")) {
      return res.status(502).json({
        success: false,
        message: "AI evaluation failed",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const evaluateApplication = async (
  req: Request<{ applicationId: string }>,
  res: Response
) => {
  try {
    const { applicationId } = req.params;

    const applicationExists = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true },
    });

    if (!applicationExists) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    const updatedApplication = await evaluateApplicationWithAI(
      applicationId
    );

    try {
      await createApplicationActivity({
        applicationId,
        type: "AI_EVALUATED",
        title: "AI Evaluated",
        description: "AI evaluation completed",
        metadata: {
          aiScore: updatedApplication.aiScore,
          aiRecommendation: updatedApplication.aiRecommendation,
        },
      });
    } catch (err) {
      console.error("Activity log failed", err);
    }

    const nextStatus = mapAiRecommendationToStatus(
      updatedApplication.aiRecommendation
    );
    const statusBeforeUpdate = normalizeApplicationStatus(updatedApplication.status);

    const statusUpdatedApplication = await prisma.application.update({
      where: { id: applicationId },
      data: { status: nextStatus as any },
      include: {
        candidate: true,
        job: true,
        answers: {
          include: {
            screeningQuestion: true,
          },
        },
      },
    });

    try {
      await createApplicationActivity({
        applicationId,
        type: "STATUS_CHANGED",
        title: "Status Changed",
        description: "Status updated",
        metadata: {
          from: statusBeforeUpdate ?? updatedApplication.status,
          to: nextStatus,
        },
      });
    } catch (err) {
      console.error("Activity log failed", err);
    }

    return res.status(200).json({
      success: true,
      data: statusUpdatedApplication,
    });
  } catch (error) {
    console.error("Evaluate application error:", error);

    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("GEMINI_API_KEY")) {
      return res.status(500).json({
        success: false,
        message: "AI evaluation is not configured",
      });
    }

    if (
      message.includes("Gemini") ||
      message.includes("parse") ||
      message.includes("JSON")
    ) {
      return res.status(502).json({
        success: false,
        message: "AI evaluation failed",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * GET /api/applications/:id/activity
 * Returns activity logs for the application, ordered by createdAt DESC.
 */
export const getApplicationActivity = async (
  req: Request<{ id: string }>,
  res: Response
) => {
  try {
    const { id: applicationId } = req.params;

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true },
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    const activities = await (prisma as any).applicationActivity.findMany({
      where: { applicationId },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      data: activities,
    });
  } catch (error) {
    console.error("Get application activity error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ---------------------------------------------------------------------------
// Application Notes (recruiter notes per application)
// ---------------------------------------------------------------------------

type CreateNoteBody = { content?: string };

/**
 * GET /api/applications/:id/notes
 * Returns notes for the application, ordered by createdAt DESC.
 */
export const getApplicationNotes = async (
  req: Request<{ id: string }>,
  res: Response
) => {
  try {
    const { id: applicationId } = req.params;

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true },
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    const notes = await (prisma as any).applicationNote.findMany({
      where: { applicationId },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      data: notes,
    });
  } catch (error) {
    console.error("Get application notes error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * POST /api/applications/:id/notes
 * Creates a note for the application; logs NOTE_ADDED activity with RECRUITER actor.
 */
export const createApplicationNote = async (
  req: Request<{ id: string }, {}, CreateNoteBody>,
  res: Response
) => {
  try {
    const { id: applicationId } = req.params;
    const { content } = req.body;

    if (typeof content !== "string" || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: "content is required and must be a non-empty string",
      });
    }

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true },
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    const recruiterId = req.user!.id;

    const note = await (prisma as any).applicationNote.create({
      data: {
        applicationId,
        recruiterId,
        content: content.trim(),
      },
    });

    try {
      await createApplicationActivity({
        applicationId,
        type: "NOTE_ADDED",
        title: "Note Added",
        description: "Recruiter added a note",
        actorType: "RECRUITER",
        actorId: recruiterId,
      });
    } catch (err) {
      console.error("Activity log failed", err);
    }

    return res.status(201).json({
      success: true,
      data: note,
    });
  } catch (error) {
    console.error("Create application note error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ---------------------------------------------------------------------------
// Application Interviews (schedule and list; status update is in interview.controller)
// ---------------------------------------------------------------------------

type CreateInterviewBody = {
  scheduledAt?: string;
  mode?: string;
  meetingLink?: string;
  location?: string;
  notes?: string;
};

const VALID_INTERVIEW_MODES = ["ONLINE", "ONSITE"] as const;

/**
 * GET /api/applications/:id/interviews
 * Returns interviews for the application, ordered by scheduledAt DESC.
 */
export const getApplicationInterviews = async (
  req: Request<{ id: string }>,
  res: Response
) => {
  try {
    const { id: applicationId } = req.params;

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true },
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    const interviews = await (prisma as any).applicationInterview.findMany({
      where: { applicationId },
      orderBy: { scheduledAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      data: interviews,
    });
  } catch (error) {
    console.error("Get application interviews error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * POST /api/applications/:id/interviews
 * Creates an interview; application must be in INTERVIEW status. Logs INTERVIEW_SCHEDULED.
 */
export const createApplicationInterview = async (
  req: Request<{ id: string }, {}, CreateInterviewBody>,
  res: Response
) => {
  try {
    const { id: applicationId } = req.params;
    const { scheduledAt, mode, meetingLink, location, notes } = req.body;

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, status: true },
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    if (String(application.status) !== "INTERVIEW") {
      return res.status(400).json({
        success: false,
        message: "Application status must be INTERVIEW to schedule an interview",
      });
    }

    if (typeof scheduledAt !== "string" || !scheduledAt.trim()) {
      return res.status(400).json({
        success: false,
        message: "scheduledAt is required (ISO 8601 datetime string)",
      });
    }

    const scheduledDate = new Date(scheduledAt);
    if (Number.isNaN(scheduledDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "scheduledAt must be a valid ISO datetime",
      });
    }

    if (
      typeof mode !== "string" ||
      !VALID_INTERVIEW_MODES.includes(mode as any)
    ) {
      return res.status(400).json({
        success: false,
        message: "mode is required and must be ONLINE or ONSITE",
      });
    }

    const interview = await (prisma as any).applicationInterview.create({
      data: {
        applicationId,
        scheduledAt: scheduledDate,
        mode: mode as "ONLINE" | "ONSITE",
        meetingLink:
          typeof meetingLink === "string" && meetingLink.trim()
            ? meetingLink.trim()
            : undefined,
        location:
          typeof location === "string" && location.trim()
            ? location.trim()
            : undefined,
        notes:
          typeof notes === "string" && notes.trim() ? notes.trim() : undefined,
        status: "SCHEDULED",
      },
    });

    try {
      await createApplicationActivity({
        applicationId,
        type: "INTERVIEW_SCHEDULED",
        title: "Interview Scheduled",
        description: "Interview scheduled",
        actorType: "RECRUITER",
        actorId: req.user!.id,
        metadata: {
          scheduledAt: scheduledAt,
          mode,
          meetingLink:
            typeof meetingLink === "string" && meetingLink.trim()
              ? meetingLink.trim()
              : undefined,
          location:
            typeof location === "string" && location.trim()
              ? location.trim()
              : undefined,
        },
      });
    } catch (err) {
      console.error("Activity log failed", err);
    }

    return res.status(201).json({
      success: true,
      data: interview,
    });
  } catch (error) {
    console.error("Create application interview error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};