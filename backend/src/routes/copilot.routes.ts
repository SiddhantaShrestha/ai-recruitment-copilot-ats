// ---------------------------------------------------------------------------
// Copilot Routes — AI assistant-friendly endpoints for OpenClaw.
//
// These endpoints are intended for agentic workflows (prioritization,
// follow-ups, comparisons, context assembly). Normal ATS UI should use
// the standard /api/applications and /api/dashboard endpoints.
// ---------------------------------------------------------------------------

import { Router } from "express";
import {
  getCopilotJobSearch,
  getCopilotPriorities,
  getCopilotFollowUpNeeded,
  getCopilotCompare,
  getCopilotJobTopCandidates,
  getCopilotFollowUpContext,
} from "../controllers/copilot.controller";

const router = Router();

router.get("/jobs/search", getCopilotJobSearch);
router.get("/priorities", getCopilotPriorities);
router.get("/followup-needed", getCopilotFollowUpNeeded);
router.get("/compare", getCopilotCompare);
router.get("/job-top-candidates", getCopilotJobTopCandidates);
router.get("/followup-context/:applicationId", getCopilotFollowUpContext);

export default router;
