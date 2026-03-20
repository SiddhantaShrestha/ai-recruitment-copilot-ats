import express from "express";
import cors from "cors";
import applicationRoutes from "./routes/application.routes";
import authRoutes from "./routes/auth.routes";
import jobRoutes from "./routes/job.routes";
import interviewRoutes from "./routes/interview.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import openClawRoutes from "./routes/openclaw.routes";
import copilotRoutes from "./routes/copilot.routes";

const app = express();

app.use(cors());
app.use(express.json());

app.post("/api/openclaw/trigger", (req, res) => {
  console.log("OpenClaw event received:", JSON.stringify(req.body, null, 2));
  res.json({ success: true });
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/applications", applicationRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/interviews", interviewRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/openclaw", openClawRoutes);
app.use("/api/copilot", copilotRoutes);

export default app;