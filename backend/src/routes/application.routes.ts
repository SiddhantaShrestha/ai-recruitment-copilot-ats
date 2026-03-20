import { Router } from "express";
import {
  createApplication,
  getApplications,
  updateApplicationStatus,
  moveApplicationStatus,
  bulkMoveApplications,
  submitApplicationAnswers,
  internalCreateApplication,
  evaluateApplication,
  getApplicationActivity,
  getApplicationNotes,
  createApplicationNote,
  getApplicationInterviews,
  createApplicationInterview,
} from "../controllers/application.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/", createApplication);
router.get("/", getApplications);
router.patch("/bulk-move", requireAuth, bulkMoveApplications);
router.get("/:id/activity", getApplicationActivity);
router.get("/:id/notes", getApplicationNotes);
router.post("/:id/notes", requireAuth, createApplicationNote);
router.get("/:id/interviews", getApplicationInterviews);
router.post("/:id/interviews", requireAuth, createApplicationInterview);
router.patch("/:id/status", updateApplicationStatus);
router.patch("/:id/move", requireAuth, moveApplicationStatus);
router.post("/:applicationId/answers", submitApplicationAnswers);
router.post("/:applicationId/evaluate", evaluateApplication);

// Internal admin flow: create application + screening answers + AI evaluation.
router.post("/internal-create", requireAuth, internalCreateApplication);

export default router;