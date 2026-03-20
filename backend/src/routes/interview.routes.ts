import { Router } from "express";
import { updateInterviewStatus } from "../controllers/interview.controller";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.patch("/:id/status", requireAuth, updateInterviewStatus);

export default router;
