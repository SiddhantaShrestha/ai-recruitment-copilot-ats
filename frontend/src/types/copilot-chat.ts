/**
 * Recruiter copilot chat — aligns with POST /api/openclaw/chat.
 * Include `metadata` on assistant turns when returned by the backend so
 * follow-up reasoning (compare, draft) can resolve context.
 */

export type CopilotChatRole = "user" | "assistant";

export type CopilotChatHistoryItem = {
  role: CopilotChatRole;
  content: string;
  /** Echo from last assistant response for hybrid follow-ups */
  metadata?: unknown;
};

export type CopilotChatMessage = CopilotChatHistoryItem;

export type CopilotChatMode = "SIMPLE_QUERY" | "REASONING_QUERY";

export type CopilotChatApiResponse = {
  reply: string;
  metadata?: unknown;
  mode?: CopilotChatMode;
};

/** Optional future hooks — not sent to API until backend supports them */
export type CopilotChatContext = {
  /** Selected application IDs (e.g. from pipeline) for future contextual prompts */
  applicationIds?: string[];
  /** Free-form note shown in UI only */
  label?: string;
};
