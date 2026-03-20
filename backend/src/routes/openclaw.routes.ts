// ---------------------------------------------------------------------------
// OpenClaw Routes — legacy simple fetch-and-show endpoints + chatbot bridge.
//
// These endpoints serve basic retrieval for the OpenClaw chatbot flow.
// For higher-value agentic workflows (prioritization, follow-ups,
// comparisons), use /api/copilot/* instead.
// ---------------------------------------------------------------------------

import { Router } from "express";
import {
  getOpenClawDashboardSummary,
  getOpenClawInterviewsToday,
  getOpenClawShortlisted,
  queryOpenClawAssistant,
  chatWithAssistant,
} from "../controllers/openclaw.controller";

const router = Router();

router.get("/shortlisted", getOpenClawShortlisted);
router.get("/interviews/today", getOpenClawInterviewsToday);
router.get("/dashboard-summary", getOpenClawDashboardSummary);
router.post("/query", queryOpenClawAssistant);
router.post("/chat", chatWithAssistant);

export default router;
