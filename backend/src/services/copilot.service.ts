// ---------------------------------------------------------------------------
// Copilot Service — data layer for OpenClaw agentic workflows.
//
// These functions power the /api/copilot/* endpoints which are designed
// for higher-value AI copilot features (prioritization, follow-up detection,
// candidate comparison, context assembly). They are NOT for simple
// fetch-and-show UI — those live in the normal dashboard/application APIs.
// ---------------------------------------------------------------------------

import { prisma } from "../lib/prisma";

// ── Types ────────────────────────────────────────────────────────────────────

export type PriorityItem =
  | { kind: "stale_screened"; applicationId: string; candidateName: string; jobTitle: string; daysSinceUpdate: number }
  | { kind: "today_interview"; applicationId: string; candidateName: string; jobTitle: string; scheduledAt: Date; mode: string; status: string }
  | { kind: "shortlisted_no_interview"; applicationId: string; candidateName: string; jobTitle: string; aiScore: number | null; daysSinceUpdate: number }
  | { kind: "recent_application"; applicationId: string; candidateName: string; jobTitle: string; appliedAt: Date };

export type FollowUpItem = {
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  status: string;
  aiScore: number | null;
  daysSinceLastActivity: number;
  hasScheduledInterview: boolean;
};

export type ComparisonPayload = {
  a: CandidateSnapshot;
  b: CandidateSnapshot;
};

export type CandidateSnapshot = {
  applicationId: string;
  candidateName: string;
  email: string;
  jobTitle: string;
  status: string;
  aiScore: number | null;
  aiSummary: string | null;
  aiRecommendation: string | null;
  answers: Array<{ question: string; answer: string }>;
  notes: Array<{ content: string; createdAt: Date }>;
};

export type TopCandidateItem = {
  applicationId: string;
  candidateName: string;
  email: string;
  aiScore: number | null;
  aiRecommendation: string | null;
  status: string;
};

export type FollowUpContext = {
  applicationId: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string | null;
  jobTitle: string;
  status: string;
  aiScore: number | null;
  aiSummary: string | null;
  aiRecommendation: string | null;
  latestNotes: Array<{ content: string; createdAt: Date }>;
  interviews: Array<{ scheduledAt: Date; mode: string; status: string }>;
  recentActivity: Array<{ type: string; title: string; description: string; createdAt: Date }>;
};

export type JobSearchItem = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d;
}

// ── 0. Job search (fuzzy by title) ───────────────────────────────────────────

export async function searchJobs(
  query: string,
  limit = 5
): Promise<JobSearchItem[]> {
  const jobs = await prisma.job.findMany({
    where: {
      title: { contains: query, mode: "insensitive" },
      isActive: true,
    },
    orderBy: { title: "asc" },
    take: limit,
    select: {
      id: true,
      title: true,
      department: true,
      location: true,
    },
  });

  return jobs;
}

// ── 1. Priorities ────────────────────────────────────────────────────────────

export async function getRecruiterPriorities(): Promise<PriorityItem[]> {
  const items: PriorityItem[] = [];

  const [staleScreened, todayInterviews, shortlistedNoInterview, recentApps] =
    await Promise.all([
      prisma.application.findMany({
        where: {
          status: "SCREENED",
          updatedAt: { lt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { updatedAt: "asc" },
        take: 5,
        select: {
          id: true,
          updatedAt: true,
          candidate: { select: { fullName: true } },
          job: { select: { title: true } },
        },
      }),

      prisma.applicationInterview.findMany({
        where: { scheduledAt: { gte: startOfToday(), lt: endOfToday() } },
        orderBy: { scheduledAt: "asc" },
        take: 10,
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
      }),

      prisma.application.findMany({
        where: {
          status: "SHORTLISTED",
          interviews: { none: {} },
        },
        orderBy: { updatedAt: "asc" },
        take: 5,
        select: {
          id: true,
          aiScore: true,
          updatedAt: true,
          candidate: { select: { fullName: true } },
          job: { select: { title: true } },
        },
      }),

      prisma.application.findMany({
        where: { status: "APPLIED" },
        orderBy: { appliedAt: "desc" },
        take: 5,
        select: {
          id: true,
          appliedAt: true,
          candidate: { select: { fullName: true } },
          job: { select: { title: true } },
        },
      }),
    ]);

  for (const a of staleScreened) {
    items.push({
      kind: "stale_screened",
      applicationId: a.id,
      candidateName: a.candidate.fullName,
      jobTitle: a.job.title,
      daysSinceUpdate: daysSince(a.updatedAt),
    });
  }

  for (const i of todayInterviews) {
    items.push({
      kind: "today_interview",
      applicationId: i.application.id,
      candidateName: i.application.candidate.fullName,
      jobTitle: i.application.job.title,
      scheduledAt: i.scheduledAt,
      mode: i.mode,
      status: i.status,
    });
  }

  for (const a of shortlistedNoInterview) {
    items.push({
      kind: "shortlisted_no_interview",
      applicationId: a.id,
      candidateName: a.candidate.fullName,
      jobTitle: a.job.title,
      aiScore: a.aiScore,
      daysSinceUpdate: daysSince(a.updatedAt),
    });
  }

  for (const a of recentApps) {
    items.push({
      kind: "recent_application",
      applicationId: a.id,
      candidateName: a.candidate.fullName,
      jobTitle: a.job.title,
      appliedAt: a.appliedAt,
    });
  }

  return items;
}

// ── 2. Follow-up needed ──────────────────────────────────────────────────────

export async function getFollowUpNeeded(
  staleDays = 3
): Promise<FollowUpItem[]> {
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

  const applications = await prisma.application.findMany({
    where: {
      status: { in: ["SHORTLISTED", "INTERVIEW"] },
    },
    orderBy: { updatedAt: "asc" },
    take: 20,
    select: {
      id: true,
      status: true,
      aiScore: true,
      candidate: { select: { fullName: true } },
      job: { select: { title: true } },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
      interviews: {
        where: { status: "SCHEDULED" },
        take: 1,
        select: { id: true },
      },
    },
  });

  const results: FollowUpItem[] = [];
  for (const app of applications) {
    const lastActivity = app.activities[0]?.createdAt ?? cutoff;
    if (lastActivity > cutoff) continue;

    results.push({
      applicationId: app.id,
      candidateName: app.candidate.fullName,
      jobTitle: app.job.title,
      status: app.status,
      aiScore: app.aiScore,
      daysSinceLastActivity: daysSince(lastActivity),
      hasScheduledInterview: app.interviews.length > 0,
    });
  }

  return results;
}

// ── 3. Compare two candidates ────────────────────────────────────────────────

async function snapshotApplication(
  applicationId: string
): Promise<CandidateSnapshot | null> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      aiScore: true,
      aiSummary: true,
      aiRecommendation: true,
      candidate: { select: { fullName: true, email: true } },
      job: { select: { title: true } },
      answers: {
        select: {
          answer: true,
          screeningQuestion: { select: { question: true } },
        },
      },
      notes: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { content: true, createdAt: true },
      },
    },
  });

  if (!app) return null;

  return {
    applicationId: app.id,
    candidateName: app.candidate.fullName,
    email: app.candidate.email,
    jobTitle: app.job.title,
    status: app.status,
    aiScore: app.aiScore,
    aiSummary: app.aiSummary,
    aiRecommendation: app.aiRecommendation,
    answers: app.answers.map((a) => ({
      question: a.screeningQuestion.question,
      answer: a.answer,
    })),
    notes: app.notes.map((n) => ({
      content: n.content,
      createdAt: n.createdAt,
    })),
  };
}

export async function compareCandidates(
  idA: string,
  idB: string
): Promise<ComparisonPayload | null> {
  const [a, b] = await Promise.all([
    snapshotApplication(idA),
    snapshotApplication(idB),
  ]);
  if (!a || !b) return null;
  return { a, b };
}

// ── 4. Top candidates for a job ──────────────────────────────────────────────

export async function getJobTopCandidates(
  jobId: string,
  limit = 3
): Promise<TopCandidateItem[]> {
  const applications = await prisma.application.findMany({
    where: {
      jobId,
      status: { notIn: ["REJECTED"] },
      aiScore: { not: null },
    },
    orderBy: { aiScore: "desc" },
    take: limit,
    select: {
      id: true,
      status: true,
      aiScore: true,
      aiRecommendation: true,
      candidate: { select: { fullName: true, email: true } },
    },
  });

  return applications.map((a) => ({
    applicationId: a.id,
    candidateName: a.candidate.fullName,
    email: a.candidate.email,
    aiScore: a.aiScore,
    aiRecommendation: a.aiRecommendation,
    status: a.status,
  }));
}

// ── 5. Follow-up context for one application ─────────────────────────────────

export async function getFollowUpContext(
  applicationId: string
): Promise<FollowUpContext | null> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      aiScore: true,
      aiSummary: true,
      aiRecommendation: true,
      candidate: {
        select: { fullName: true, email: true, phone: true },
      },
      job: { select: { title: true } },
      notes: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { content: true, createdAt: true },
      },
      interviews: {
        orderBy: { scheduledAt: "desc" },
        take: 5,
        select: { scheduledAt: true, mode: true, status: true },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { type: true, title: true, description: true, createdAt: true },
      },
    },
  });

  if (!app) return null;

  return {
    applicationId: app.id,
    candidateName: app.candidate.fullName,
    candidateEmail: app.candidate.email,
    candidatePhone: app.candidate.phone,
    jobTitle: app.job.title,
    status: app.status,
    aiScore: app.aiScore,
    aiSummary: app.aiSummary,
    aiRecommendation: app.aiRecommendation,
    latestNotes: app.notes.map((n) => ({
      content: n.content,
      createdAt: n.createdAt,
    })),
    interviews: app.interviews.map((i) => ({
      scheduledAt: i.scheduledAt,
      mode: i.mode,
      status: i.status,
    })),
    recentActivity: app.activities.map((a) => ({
      type: a.type,
      title: a.title,
      description: a.description,
      createdAt: a.createdAt,
    })),
  };
}
