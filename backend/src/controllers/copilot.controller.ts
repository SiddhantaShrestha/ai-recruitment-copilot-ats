// ---------------------------------------------------------------------------
// Copilot Controller — endpoints for OpenClaw agentic workflows.
//
// These are designed for AI copilot use (prioritization, follow-ups,
// comparisons, context assembly). Normal dashboard/table display should
// use the standard /api/applications and /api/dashboard endpoints instead.
// ---------------------------------------------------------------------------

import { Request, Response } from "express";
import {
  getRecruiterPriorities,
  getFollowUpNeeded,
  compareCandidates,
  getJobTopCandidates,
  getFollowUpContext,
  searchJobs,
} from "../services/copilot.service";

type LimitQuery = { limit?: string };
type JobSearchQuery = { q?: string; limit?: string };
type StaleDaysQuery = { staleDays?: string };
type CompareQuery = { applicationIdA?: string; applicationIdB?: string };
type JobTopQuery = { jobId?: string; limit?: string };

function safeInt(raw: string | undefined, fallback: number, max = 50): number {
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

/**
 * GET /api/copilot/jobs/search?q=...&limit=5
 * Fuzzy job title search so recruiters never need to know raw IDs.
 */
export async function getCopilotJobSearch(
  req: Request<{}, {}, {}, JobSearchQuery>,
  res: Response
) {
  try {
    const q = req.query.q?.trim();
    if (!q) {
      return res.status(400).json({
        success: false,
        message: "q (search query) is required",
      });
    }

    const limit = safeInt(req.query.limit, 5, 20);
    const data = await searchJobs(q, limit);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Copilot job search error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
}

/**
 * GET /api/copilot/priorities
 * Returns recruiter priorities: stale screened, today's interviews,
 * shortlisted without interview, and recent applications.
 */
export async function getCopilotPriorities(
  _req: Request,
  res: Response
) {
  try {
    const data = await getRecruiterPriorities();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Copilot priorities error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
}

/**
 * GET /api/copilot/followup-needed?staleDays=3
 * Returns candidates in SHORTLISTED or INTERVIEW with no recent activity.
 */
export async function getCopilotFollowUpNeeded(
  req: Request<{}, {}, {}, StaleDaysQuery>,
  res: Response
) {
  try {
    const staleDays = safeInt(req.query.staleDays, 3, 30);
    const data = await getFollowUpNeeded(staleDays);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Copilot follow-up needed error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
}

/**
 * GET /api/copilot/compare?applicationIdA=...&applicationIdB=...
 * Returns structured side-by-side comparison of two applications.
 */
export async function getCopilotCompare(
  req: Request<{}, {}, {}, CompareQuery>,
  res: Response
) {
  try {
    const { applicationIdA, applicationIdB } = req.query;

    if (!applicationIdA || !applicationIdB) {
      return res.status(400).json({
        success: false,
        message: "applicationIdA and applicationIdB are required",
      });
    }

    const data = await compareCandidates(applicationIdA, applicationIdB);
    if (!data) {
      return res.status(404).json({
        success: false,
        message: "One or both applications not found",
      });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Copilot compare error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
}

/**
 * GET /api/copilot/job-top-candidates?jobId=...&limit=3
 * Returns top candidates for a specific job by AI score.
 */
export async function getCopilotJobTopCandidates(
  req: Request<{}, {}, {}, JobTopQuery>,
  res: Response
) {
  try {
    const { jobId } = req.query;
    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: "jobId is required",
      });
    }

    const limit = safeInt(req.query.limit, 3, 20);
    const data = await getJobTopCandidates(jobId, limit);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Copilot job top candidates error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
}

/**
 * GET /api/copilot/followup-context/:applicationId
 * Returns all context needed to draft a follow-up for one application.
 */
export async function getCopilotFollowUpContext(
  req: Request<{ applicationId: string }>,
  res: Response
) {
  try {
    const { applicationId } = req.params;
    const data = await getFollowUpContext(applicationId);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Copilot follow-up context error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
}
