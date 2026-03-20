// ---------------------------------------------------------------------------
// OpenClaw Controller — simple fetch-and-show endpoints + chatbot bridge.
//
// These handle basic deterministic retrieval for the chatbot flow.
// For higher-value agentic workflows (prioritization, follow-ups,
// comparisons, context assembly), use /api/copilot/* instead.
// ---------------------------------------------------------------------------

import { Request, Response } from "express";
import {
  getDashboardSummary,
  getShortlistedCandidates,
  getTodayInterviews,
  parseOpenClawLimit,
  type OpenClawIntent,
} from "../services/openclaw.service";
import {
  handleRecruiterChatMessage,
  normalizeChatHistory,
} from "../services/openclaw-chatbot.service";
import {
  getRecruiterPriorities,
  getFollowUpNeeded,
  getJobTopCandidates,
  searchJobs,
} from "../services/copilot.service";

type LimitQuery = { limit?: string };
type OpenClawQueryBody = {
  intent?: OpenClawIntent;
  limit?: number;
  jobName?: string;
  staleDays?: number;
};
type OpenClawChatBody = {
  message?: string;
  /** Prior turns for multi-turn follow-ups (optional). */
  history?: unknown;
};

/**
 * GET /api/openclaw/shortlisted
 * Used by OpenClaw assistant.
 */
export async function getOpenClawShortlisted(
  req: Request<{}, {}, {}, LimitQuery>,
  res: Response
) {
  try {
    const limit = parseOpenClawLimit(req.query.limit, 5);
    const data = await getShortlistedCandidates(limit);
    return res.status(200).json(data);
  } catch (error) {
    console.error("OpenClaw shortlisted error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * GET /api/openclaw/interviews/today
 * Used by OpenClaw assistant.
 */
export async function getOpenClawInterviewsToday(
  req: Request<{}, {}, {}, LimitQuery>,
  res: Response
) {
  try {
    const limit = parseOpenClawLimit(req.query.limit, 5);
    const data = await getTodayInterviews(limit);
    return res.status(200).json(data);
  } catch (error) {
    console.error("OpenClaw interviews today error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * GET /api/openclaw/dashboard-summary
 * Used by OpenClaw assistant.
 */
export async function getOpenClawDashboardSummary(_req: Request, res: Response) {
  try {
    const data = await getDashboardSummary();
    return res.status(200).json(data);
  } catch (error) {
    console.error("OpenClaw dashboard summary error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

/**
 * POST /api/openclaw/query
 * OpenClaw assistant query handler.
 */
export async function queryOpenClawAssistant(
  req: Request<{}, {}, OpenClawQueryBody>,
  res: Response
) {
  try {
    const { intent, limit } = req.body;

    if (!intent) {
      return res.status(400).json({
        success: false,
        message: "intent is required",
      });
    }

    let data: unknown;

    switch (intent) {
      case "GET_SHORTLISTED": {
        const safeLimit =
          typeof limit === "number"
            ? parseOpenClawLimit(String(limit), 5)
            : 5;
        data = await getShortlistedCandidates(safeLimit);
        break;
      }
      case "GET_TODAY_INTERVIEWS": {
        const safeLimit =
          typeof limit === "number"
            ? parseOpenClawLimit(String(limit), 5)
            : 5;
        data = await getTodayInterviews(safeLimit);
        break;
      }
      case "GET_DASHBOARD_SUMMARY":
        data = await getDashboardSummary();
        break;
      case "GET_PRIORITIES":
        data = await getRecruiterPriorities();
        break;
      case "GET_FOLLOWUP_NEEDED": {
        const days =
          typeof req.body.staleDays === "number" ? req.body.staleDays : 3;
        data = await getFollowUpNeeded(days);
        break;
      }
      case "GET_JOB_TOP_CANDIDATES": {
        const jobName = req.body.jobName;
        if (!jobName) {
          return res.status(400).json({
            success: false,
            message: "jobName is required for GET_JOB_TOP_CANDIDATES",
          });
        }
        const jobs = await searchJobs(jobName, 5);
        if (jobs.length === 0) {
          data = { matches: [], candidates: [] };
        } else if (
          jobs.length === 1 ||
          jobs[0].title.toLowerCase() === jobName.toLowerCase()
        ) {
          const job = jobs.length === 1 ? jobs[0] : jobs.find(
            (j) => j.title.toLowerCase() === jobName.toLowerCase()
          ) ?? jobs[0];
          const candidates = await getJobTopCandidates(job.id, 3);
          data = { job, candidates };
        } else {
          data = { matches: jobs, candidates: [] };
        }
        break;
      }
      default:
        return res.status(400).json({
          success: false,
          message: "Unsupported intent",
        });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("OpenClaw query handler error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}

/**
 * POST /api/openclaw/chat
 * Hybrid recruiter copilot: deterministic ATS + optional Gemini reasoning.
 * Body: { message, history?: [{ role, content, metadata? }] }
 */
export async function chatWithAssistant(
  req: Request<{}, {}, OpenClawChatBody>,
  res: Response
) {
  try {
    const { message, history: historyRaw } = req.body;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "message is required",
      });
    }

    const history = normalizeChatHistory(historyRaw);

    const result = await handleRecruiterChatMessage({
      message: message.trim(),
      history,
    });

    return res.status(200).json({
      success: true,
      data: {
        reply: result.reply,
        ...(result.metadata !== undefined && { metadata: result.metadata }),
        mode: result.mode,
      },
    });
  } catch (error) {
    console.error("OpenClaw chat error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
}
