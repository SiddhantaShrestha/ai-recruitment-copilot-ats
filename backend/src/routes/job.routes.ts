import { Router } from "express";
import {
  createJob,
  searchJobs,
  listLatestJobs,
  listActiveJobs,
} from "../controllers/job.controller";
import {
  createScreeningQuestions,
  getScreeningQuestions,
} from "../controllers/screeningQuestion.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.post("/", requireAuth, createJob);
router.get("/search", requireAuth, searchJobs);
router.get("/latest", requireAuth, listLatestJobs);
router.get("/active", requireAuth, listActiveJobs);

router.post("/:jobId/screening-questions", requireAuth, createScreeningQuestions);
router.get("/:jobId/screening-questions", requireAuth, getScreeningQuestions);

export default router;

