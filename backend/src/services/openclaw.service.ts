// ---------------------------------------------------------------------------
// OpenClaw Service — Telegram notification workflow + legacy simple queries.
//
// triggerOpenClawWorkflow: sends screening notifications to Telegram.
// getShortlistedCandidates / getTodayInterviews / getDashboardSummary:
//   simple deterministic fetches used by the chatbot bridge.
//   For higher-value agentic queries, see copilot.service.ts.
// ---------------------------------------------------------------------------

import { prisma } from "../lib/prisma";

type OpenClawApplicationPayload = {
    id: string;
    candidateId: string;
    jobId: string;
    status: string;
    aiScore: number | null;
    aiSummary: string | null;
    aiRecommendation: string | null;
    appliedAt: Date;
    updatedAt: Date;
    candidate: {
      id: string;
      fullName: string;
      email: string;
      phone: string | null;
      resumeUrl: string | null;
      createdAt: Date;
      updatedAt: Date;
    };
    job: {
      id: string;
      title: string;
      department: string | null;
      location: string | null;
      description: string | null;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    };
    answers: Array<{
      id: string;
      applicationId: string;
      candidateId: string;
      screeningQuestionId: string;
      answer: string;
      createdAt: Date;
      screeningQuestion: {
        id: string;
        jobId: string;
        question: string;
        order: number;
        createdAt: Date;
      };
    }>;
  };
  
  export const triggerOpenClawWorkflow = async (
    payload: OpenClawApplicationPayload
  ) => {
    const webhookUrl = process.env.OPENCLAW_WEBHOOK_URL;
    const token = process.env.OPENCLAW_HOOKS_TOKEN;
    const telegramTo = process.env.OPENCLAW_TELEGRAM_TO;
  
    if (!webhookUrl) {
      throw new Error("OPENCLAW_WEBHOOK_URL is not set");
    }
  
    if (!token) {
      throw new Error("OPENCLAW_HOOKS_TOKEN is not set");
    }
  
    if (!telegramTo) {
      throw new Error("OPENCLAW_TELEGRAM_TO is not set");
    }
  
    const message = `
    You are a recruiter assistant.
    
    Send a clean Telegram notification message (no extra explanations, no meta text).
    
    Format:
    
    📥 New Candidate Screened
    
    👤 Name: ${payload.candidate.fullName}
    💼 Role: ${payload.job.title}
    📍 Location: ${payload.job.location ?? "N/A"}
    
    📊 Score: ${payload.aiScore ?? "N/A"}
    ✅ Recommendation: ${payload.aiRecommendation ?? "N/A"}
    
    📝 Summary:
    ${payload.aiSummary ?? "N/A"}
    
    📞 Contact:
    Email: ${payload.candidate.email}
    Phone: ${payload.candidate.phone ?? "N/A"}
    
    Keep it short, clean, and professional.
    Do NOT add any extra explanation.
    `;
  
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        message,
        name: "Recruitment Screening",
        agentId: "main",
        wakeMode: "now",
        deliver: true,
        channel: "telegram",
        to: telegramTo,
      }),
    });
  
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `OpenClaw webhook failed: ${response.status} ${response.statusText} - ${errorText}`
      );
    }
  
    const result = await response.json().catch(() => null);
    console.log("OpenClaw webhook triggered successfully:", result);
  
    return result;
  };

export type OpenClawIntent =
  | "GET_SHORTLISTED"
  | "GET_TODAY_INTERVIEWS"
  | "GET_DASHBOARD_SUMMARY"
  | "GET_PRIORITIES"
  | "GET_FOLLOWUP_NEEDED"
  | "GET_JOB_TOP_CANDIDATES";

export type OpenClawShortlistedItem = {
  applicationId: string;
  fullName: string;
  jobTitle: string;
  aiScore: number | null;
  aiRecommendation: string | null;
  status: string;
};

export type OpenClawTodayInterviewItem = {
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  scheduledAt: Date;
  mode: "ONLINE" | "ONSITE";
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
};

export type OpenClawDashboardSummary = {
  totalApplications: number;
  shortlisted: number;
  interview: number;
  hired: number;
  rejected: number;
};

export function parseOpenClawLimit(
  limitRaw: string | undefined,
  defaultValue = 5
): number {
  if (!limitRaw) return defaultValue;
  const parsed = Number(limitRaw);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return Math.min(Math.floor(parsed), 50);
}

export async function getShortlistedCandidates(
  limit: number
): Promise<OpenClawShortlistedItem[]> {
  const applications = await prisma.application.findMany({
    where: { status: "SHORTLISTED" },
    orderBy: [{ aiScore: "desc" }, { updatedAt: "desc" }],
    take: limit,
    select: {
      id: true,
      status: true,
      aiScore: true,
      aiRecommendation: true,
      candidate: { select: { fullName: true } },
      job: { select: { title: true } },
    },
  });

  return applications.map((item) => ({
    applicationId: item.id,
    fullName: item.candidate.fullName,
    jobTitle: item.job.title,
    aiScore: item.aiScore,
    aiRecommendation: item.aiRecommendation,
    status: item.status,
  }));
}

export async function getTodayInterviews(
  limit: number
): Promise<OpenClawTodayInterviewItem[]> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const interviews = await prisma.applicationInterview.findMany({
    where: {
      scheduledAt: {
        gte: startOfToday,
        lt: endOfToday,
      },
    },
    orderBy: { scheduledAt: "asc" },
    take: limit,
    select: {
      scheduledAt: true,
      mode: true,
      status: true,
      application: {
        select: {
          id: true,
          candidate: { select: { fullName: true } },
          job: { select: { title: true } },
        },
      },
    },
  });

  return interviews.map((item) => ({
    applicationId: item.application.id,
    candidateName: item.application.candidate.fullName,
    jobTitle: item.application.job.title,
    scheduledAt: item.scheduledAt,
    mode: item.mode,
    status: item.status,
  }));
}

export async function getDashboardSummary(): Promise<OpenClawDashboardSummary> {
  const [totalApplications, shortlisted, interview, hired, rejected] =
    await Promise.all([
      prisma.application.count(),
      prisma.application.count({ where: { status: "SHORTLISTED" } }),
      prisma.application.count({ where: { status: "INTERVIEW" } }),
      prisma.application.count({ where: { status: "HIRED" } }),
      prisma.application.count({ where: { status: "REJECTED" } }),
    ]);

  return {
    totalApplications,
    shortlisted,
    interview,
    hired,
    rejected,
  };
}