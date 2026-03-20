// ---------------------------------------------------------------------------
// Recruiter chat / hybrid copilot — shared types for POST /api/openclaw/chat.
// ---------------------------------------------------------------------------

/** One turn in optional multi-turn history (Telegram or web UI). */
export type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
  /**
   * Optional structured payload from the previous assistant turn.
   * Web clients should echo this back for reliable follow-ups (compare, draft).
   */
  metadata?: ChatTurnMetadata;
};

/**
 * Structured snapshot of the last deterministic reply (source of truth for IDs).
 * Never shown to the user as raw JSON — carried in API responses / echoed in history.
 */
export type ChatTurnMetadata =
  | JobTopCandidatesMetadata
  | ShortlistedMetadata
  | TodayInterviewsMetadata
  | PrioritiesMetadata
  | FollowUpNeededMetadata
  | DashboardMetadata;

export type JobTopCandidatesMetadata = {
  kind: "JOB_TOP_CANDIDATES";
  jobId: string;
  jobTitle: string;
  candidates: Array<{
    applicationId: string;
    candidateName: string;
    aiScore: number | null;
    aiRecommendation: string | null;
    status: string;
  }>;
};

export type ShortlistedMetadata = {
  kind: "SHORTLISTED";
  items: Array<{
    applicationId: string;
    fullName: string;
    jobTitle: string;
    aiScore: number | null;
    aiRecommendation: string | null;
    status: string;
  }>;
};

export type TodayInterviewsMetadata = {
  kind: "TODAY_INTERVIEWS";
  items: Array<{
    applicationId: string;
    candidateName: string;
    jobTitle: string;
    scheduledAt: string;
    mode: string;
    status: string;
  }>;
};

export type PrioritiesMetadata = {
  kind: "PRIORITIES";
  items: Array<{
    kind: string;
    applicationId: string;
    candidateName: string;
    jobTitle: string;
    detail?: string;
  }>;
};

export type FollowUpNeededMetadata = {
  kind: "FOLLOWUP_NEEDED";
  items: Array<{
    applicationId: string;
    candidateName: string;
    jobTitle: string;
    status: string;
    aiScore: number | null;
    daysSinceLastActivity: number;
    hasScheduledInterview: boolean;
  }>;
};

export type DashboardMetadata = {
  kind: "DASHBOARD_SUMMARY";
  totalApplications: number;
  shortlisted: number;
  interview: number;
  hired: number;
  rejected: number;
};

export type ChatMode = "SIMPLE_QUERY" | "REASONING_QUERY";

export type ChatHandlerResult = {
  reply: string;
  /** Echo to client for next-turn follow-ups; omitted when not applicable. */
  metadata?: ChatTurnMetadata;
  mode: ChatMode;
};
