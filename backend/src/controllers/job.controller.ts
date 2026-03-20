import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

type CreateJobBody = {
  title?: string;
  department?: string;
  location?: string;
  description?: string;
  isActive?: boolean;
  active?: boolean;
  screeningQuestions?: Array<{
    question?: string;
    order?: number;
    type?: "TEXT" | "YES_NO" | "NUMBER";
  }>;
};

type JobSearchQuery = { q?: string; limit?: string };

type JobSearchItem = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
};

function parseLimit(raw: string | undefined, defaultValue: number, max = 20) {
  if (!raw) return defaultValue;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return defaultValue;
  return Math.min(Math.floor(n), max);
}

export const createJob = async (
  req: Request<{}, {}, CreateJobBody>,
  res: Response
) => {
  try {
    const {
      title,
      department,
      location,
      description,
      isActive,
      active,
      screeningQuestions,
    } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: "title is required",
      });
    }

    const resolvedIsActive =
      typeof isActive === "boolean" ? isActive : typeof active === "boolean" ? active : true;

    const hasQuestions =
      Array.isArray(screeningQuestions) && screeningQuestions.length > 0;

    const job = await prisma.$transaction(async (tx) => {
      const createdJob = await tx.job.create({
        data: {
          title,
          department,
          location,
          description,
          isActive: resolvedIsActive,
        },
      });

      if (hasQuestions) {
        const normalizedQuestions = screeningQuestions!.map((q) => ({
          question: q.question,
          order: q.order,
          type: q.type ?? "TEXT",
        }));

        for (const q of normalizedQuestions) {
          if (
            !q.question ||
            typeof q.order !== "number" ||
            !Number.isInteger(q.order) ||
            (q.type !== "TEXT" && q.type !== "YES_NO" && q.type !== "NUMBER")
          ) {
            throw new Error(
              "Each screening question must include a non-empty question, an integer order, and a valid type"
            );
          }
        }

        await Promise.all(
          normalizedQuestions.map((q) =>
            tx.screeningQuestion.create({
              data: {
                jobId: createdJob.id,
                question: q.question as string,
                order: q.order as number,
                type: q.type,
              },
            })
          )
        );
      }

      return createdJob;
    });

    return res.status(201).json({
      success: true,
      message: "Job created successfully",
      data: job,
    });
  } catch (error) {
    console.error("Create job error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

/**
 * GET /api/jobs/search?q=...&limit=5
 * Admin-facing job search for dropdowns.
 */
export const searchJobs = async (
  req: Request<{}, {}, {}, JobSearchQuery>,
  res: Response
) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      return res.status(400).json({
        success: false,
        message: "q is required",
      });
    }

    const limit = parseLimit(req.query.limit, 5);

    const startsWithMatches = await prisma.job.findMany({
      where: {
        isActive: true,
        title: {
          startsWith: q,
          mode: "insensitive",
        },
      },
      take: limit,
      select: { id: true, title: true, department: true, location: true },
    });

    if (startsWithMatches.length >= limit) {
      return res.status(200).json({
        success: true,
        data: startsWithMatches satisfies JobSearchItem[],
      });
    }

    const remaining = limit - startsWithMatches.length;
    const additionalMatches = await prisma.job.findMany({
      where: {
        isActive: true,
        title: { contains: q, mode: "insensitive" },
        NOT: {
          id: { in: startsWithMatches.map((j) => j.id) },
        },
      },
      take: remaining,
      select: { id: true, title: true, department: true, location: true },
    });

    return res.status(200).json({
      success: true,
      data: [...startsWithMatches, ...additionalMatches] satisfies JobSearchItem[],
    });
  } catch (error) {
    console.error("Job search error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

