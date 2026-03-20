import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

const PIPELINE_STATUSES = [
  "APPLIED",
  "SCREENED",
  "SHORTLISTED",
  "INTERVIEW",
  "OFFER",
  "HIRED",
  "REJECTED",
] as const;

const AI_RECOMMENDATIONS = ["SHORTLIST", "MAYBE", "REJECT"] as const;

/**
 * GET /api/dashboard/metrics
 * Returns pipeline stats, AI insights, top candidates, and recent activity for recruiter dashboard.
 */
export const getDashboardMetrics = async (_req: Request, res: Response) => {
  try {
    // 1) Total application count
    const totalApplications = await prisma.application.count();

    // 2) Count by status (ensure all statuses present with 0 if none)
    const statusCounts = await prisma.application.groupBy({
      by: ["status"],
      _count: { status: true },
    });
    const countByStatus: Record<string, number> = {};
    for (const s of PIPELINE_STATUSES) {
      countByStatus[s] = 0;
    }
    for (const row of statusCounts) {
      countByStatus[row.status] = row._count.status;
    }

    // 3) AI recommendation breakdown (SHORTLIST, MAYBE, REJECT, unknown)
    const recCounts = await prisma.application.groupBy({
      by: ["aiRecommendation"],
      _count: { aiRecommendation: true },
    });
    const recommendationBreakdown: Record<string, number> = {
      SHORTLIST: 0,
      MAYBE: 0,
      REJECT: 0,
      unknown: 0,
    };
    for (const row of recCounts) {
      const key =
        row.aiRecommendation && AI_RECOMMENDATIONS.includes(row.aiRecommendation as any)
          ? row.aiRecommendation
          : "unknown";
      recommendationBreakdown[key] = row._count.aiRecommendation;
    }

    // 4) Average AI score (applications with aiScore not null)
    const avgResult = await prisma.application.aggregate({
      _avg: { aiScore: true },
      where: { aiScore: { not: null } },
    });
    const averageAiScore =
      avgResult._avg.aiScore != null
        ? Math.round(avgResult._avg.aiScore * 10) / 10
        : null;

    // 5) Top 5 candidates by AI score
    const topCandidates = await prisma.application.findMany({
      where: { aiScore: { not: null } },
      orderBy: { aiScore: "desc" },
      take: 5,
      select: {
        id: true,
        aiScore: true,
        aiRecommendation: true,
        status: true,
        candidate: { select: { fullName: true } },
        job: { select: { title: true } },
      },
    });

    // 6) Latest 5 activity items
    const recentActivity = await prisma.applicationActivity.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        title: true,
        description: true,
        createdAt: true,
        applicationId: true,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        totalApplications,
        countByStatus,
        recommendationBreakdown,
        averageAiScore,
        topCandidates: topCandidates.map((a) => ({
          id: a.id,
          candidateFullName: a.candidate.fullName,
          jobTitle: a.job.title,
          aiScore: a.aiScore,
          aiRecommendation: a.aiRecommendation,
          status: a.status,
        })),
        recentActivity: recentActivity.map((a) => ({
          title: a.title,
          description: a.description,
          createdAt: a.createdAt,
          applicationId: a.applicationId,
        })),
      },
    });
  } catch (error) {
    console.error("Get dashboard metrics error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
