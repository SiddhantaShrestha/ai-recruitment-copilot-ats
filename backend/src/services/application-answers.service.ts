import { prisma } from "../lib/prisma";
import { createApplicationActivity } from "./activity.service";
import { evaluateApplicationWithAI } from "./ai-evaluation.service";
import { triggerOpenClawWorkflow } from "./openclaw.service";

export type ScreeningAnswerInput = {
  screeningQuestionId: string;
  answer: string;
};

export class ApplicationAnswersError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Application statuses (must match controller mapping).
type ApplicationPipelineStatus =
  | "APPLIED"
  | "SCREENED"
  | "SHORTLISTED"
  | "INTERVIEW"
  | "OFFER"
  | "HIRED"
  | "REJECTED";

const LEGACY_STATUS_ALIAS: Record<
  string,
  ApplicationPipelineStatus | undefined
> = {
  SCREENING_PENDING: "SCREENED",
  SCREENING_IN_PROGRESS: "SCREENED",
};

function normalizeApplicationStatus(
  input: string
): ApplicationPipelineStatus | null {
  const allowed: ApplicationPipelineStatus[] = [
    "APPLIED",
    "SCREENED",
    "SHORTLISTED",
    "INTERVIEW",
    "OFFER",
    "HIRED",
    "REJECTED",
  ];
  if (allowed.includes(input as ApplicationPipelineStatus)) {
    return input as ApplicationPipelineStatus;
  }
  if (input in LEGACY_STATUS_ALIAS) {
    return LEGACY_STATUS_ALIAS[input] ?? null;
  }
  return null;
}

function mapAiRecommendationToStatus(
  recommendation: string | null
): ApplicationPipelineStatus {
  if (recommendation === "REJECT") return "REJECTED";
  if (recommendation === "SHORTLIST") return "SHORTLISTED";
  return "SCREENED";
}

/**
 * Saves screening answers for an application and triggers the existing
 * AI evaluation + status update + OpenClaw workflow.
 *
 * This is used both by the existing public-ish endpoint and the new
 * internal admin create flow.
 */
export async function submitApplicationAnswersInternal(params: {
  applicationId: string;
  candidateId: string;
  answers: ScreeningAnswerInput[];
}): Promise<any> {
  const { applicationId, candidateId, answers } = params;

  if (!candidateId) {
    throw new ApplicationAnswersError(400, "candidateId is required");
  }
  if (!answers || !Array.isArray(answers) || answers.length === 0) {
    throw new ApplicationAnswersError(400, "answers must be a non-empty array");
  }

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      candidate: true,
      job: true,
    },
  });

  if (!application) {
    throw new ApplicationAnswersError(404, "Application not found");
  }

  if (application.candidateId !== candidateId) {
    throw new ApplicationAnswersError(
      400,
      "candidateId does not match this application"
    );
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
  });

  if (!candidate) {
    throw new ApplicationAnswersError(404, "Candidate not found");
  }

  const normalizedAnswers = answers.map((a) => ({
    screeningQuestionId: a.screeningQuestionId,
    answer: a.answer,
  }));

  for (const a of normalizedAnswers) {
    if (!a.screeningQuestionId || !a.answer) {
      throw new ApplicationAnswersError(
        400,
        "Each answer must include screeningQuestionId and answer"
      );
    }
  }

  const screeningQuestionIds = normalizedAnswers.map((a) => a.screeningQuestionId);

  const screeningQuestions = await prisma.screeningQuestion.findMany({
    where: {
      id: { in: screeningQuestionIds },
    },
  });

  if (screeningQuestions.length !== screeningQuestionIds.length) {
    throw new ApplicationAnswersError(
      400,
      "One or more screening questions not found"
    );
  }

  const invalidQuestion = screeningQuestions.find(
    (q) => q.jobId !== application.jobId
  );

  if (invalidQuestion) {
    throw new ApplicationAnswersError(
      400,
      "One or more screening questions do not belong to this job"
    );
  }

  const createdAnswers = await prisma.$transaction(async (tx) => {
    await tx.screeningAnswer.deleteMany({
      where: { applicationId },
    });

    return Promise.all(
      normalizedAnswers.map((a) =>
        tx.screeningAnswer.create({
          data: {
            applicationId,
            candidateId,
            screeningQuestionId: a.screeningQuestionId,
            answer: a.answer,
          },
        })
      )
    );
  });

  // Activity log (best-effort; activity service never throws).
  await createApplicationActivity({
    applicationId,
    type: "ANSWERS_SUBMITTED" as any,
    title: "Answers Submitted",
    description: `${createdAnswers.length} answers received`,
  });

  // AI evaluation (updates aiScore/aiSummary/aiRecommendation).
  const aiEvaluatedApplication = await evaluateApplicationWithAI(applicationId);

  await createApplicationActivity({
    applicationId,
    type: "AI_EVALUATED" as any,
    title: "AI Evaluated",
    description: "AI evaluation completed",
    metadata: {
      aiScore: aiEvaluatedApplication.aiScore,
      aiRecommendation: aiEvaluatedApplication.aiRecommendation,
    },
  });

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

  await createApplicationActivity({
    applicationId,
    type: "STATUS_CHANGED" as any,
    title: "Status Changed",
    description: "Status updated",
    metadata: {
      from: statusBeforeUpdate ?? application.status,
      to: nextStatus,
    },
  });

  try {
    await triggerOpenClawWorkflow(updatedApplication as any);
    await createApplicationActivity({
      applicationId,
      type: "OPENCLAW_TRIGGERED" as any,
      title: "OpenClaw Triggered",
      description: "OpenClaw workflow triggered successfully",
      actorType: "SYSTEM",
    });
    await createApplicationActivity({
      applicationId,
      type: "TELEGRAM_SENT" as any,
      title: "Telegram Notification Sent",
      description: "Recruiter notification sent successfully",
      actorType: "SYSTEM",
    });
  } catch (openClawErr) {
    // Keep the response even if OpenClaw fails.
    console.error("OpenClaw workflow failed", openClawErr);
  }

  return updatedApplication;
}

