// ---------------------------------------------------------------------------
// OpenClaw Chatbot Service — hybrid recruiter copilot.
//
// SIMPLE_QUERY: deterministic ATS data via copilot + openclaw services (no LLM).
// REASONING_QUERY: structured ATS context from DB + Gemini for explain/compare/draft.
// ---------------------------------------------------------------------------

import type { OpenClawIntent } from "./openclaw.service";
import { formatOpenClawResponse } from "./openclaw-formatter.service";
import {
  getRecruiterPriorities,
  getFollowUpNeeded,
  getJobTopCandidates,
  searchJobs,
  type TopCandidateItem,
  type JobSearchItem,
} from "./copilot.service";
import { classifyChatQuery } from "./chat-classifier.service";
import {
  resolveReasoningAtsContext,
  buildJobTopMetadata,
} from "./chat-context.service";
import { generateRecruiterCopilotReply } from "./copilot-llm.service";
import type {
  ChatHandlerResult,
  ChatHistoryItem,
  ChatTurnMetadata,
} from "../types/chat.types";
import type { PriorityItem, FollowUpItem } from "./copilot.service";

// ── History normalization (optional body from web / Telegram proxy) ─────────

export function normalizeChatHistory(raw: unknown): ChatHistoryItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatHistoryItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (o.role !== "user" && o.role !== "assistant") continue;
    if (typeof o.content !== "string") continue;
    const entry: ChatHistoryItem = {
      role: o.role,
      content: o.content,
    };
    if (o.metadata !== undefined && o.metadata !== null) {
      entry.metadata = o.metadata as ChatTurnMetadata;
    }
    out.push(entry);
  }
  return out;
}

// ── Intent detection (SIMPLE path) ───────────────────────────────────────────

const VALID_INTENTS: OpenClawIntent[] = [
  "GET_SHORTLISTED",
  "GET_TODAY_INTERVIEWS",
  "GET_DASHBOARD_SUMMARY",
  "GET_PRIORITIES",
  "GET_FOLLOWUP_NEEDED",
  "GET_JOB_TOP_CANDIDATES",
];

const INTENT_DETECTION_PROMPT = `You are Recruit Nepal's AI recruiter assistant.
Your job is to understand recruiter queries and decide what data to fetch.

Supported intents:
1. GET_SHORTLISTED — shortlisted/top/best candidates (no specific job mentioned).
2. GET_TODAY_INTERVIEWS — interviews scheduled today.
3. GET_DASHBOARD_SUMMARY — dashboard/recruitment/pipeline summary and stats.
4. GET_PRIORITIES — what should I prioritize today / what needs attention.
5. GET_FOLLOWUP_NEEDED — which candidates need follow-up.
6. GET_JOB_TOP_CANDIDATES — best/top candidates for a specific job role. Extract the job name.

Rules:
- Return ONLY JSON.
- For GET_JOB_TOP_CANDIDATES, include "jobName" with the role name the user mentioned.
  Example: { "intent": "GET_JOB_TOP_CANDIDATES", "jobName": "Frontend Developer" }
- For all other intents: { "intent": "..." }
- If outside supported areas: { "intent": "UNKNOWN" }
- Do not explain anything.`;

type DetectedIntentResult = { intent: string; jobName?: string };
type QueryApiResponse = {
  success?: boolean;
  data?: unknown;
  message?: string;
};

const JOB_CANDIDATE_PATTERNS = [
  /\b(?:best|top|strongest|highest[\s-]?scored?)\s+candidates?\s+for\s+(.+)/i,
  /\b(?:best|top)\s+candidate\s+for\s+(.+)/i,
  /\b(?:best|top)\s+people\s+for\s+(.+)/i,
  /\bwho\s+(?:are|is)\s+the\s+best\s+(?:candidates?\s+)?for\s+(.+)/i,
  /\btop\s+\d*\s*(?:candidates?\s+)?for\s+(.+)/i,
];

function fallbackDetectJobIntent(
  message: string
): DetectedIntentResult | null {
  const trimmed = message.trim();
  for (const pattern of JOB_CANDIDATE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      const jobName = match[1].replace(/[?.!]+$/, "").trim();
      if (jobName.length > 0) {
        return { intent: "GET_JOB_TOP_CANDIDATES", jobName };
      }
    }
  }
  return null;
}

function fallbackDetectSimpleIntent(
  message: string
): DetectedIntentResult | null {
  const m = message.trim();

  const job = fallbackDetectJobIntent(m);
  if (job) return job;

  if (
    /\b(interviews?\s+today|today'?s?\s+interviews?)\b/i.test(m)
  ) {
    return { intent: "GET_TODAY_INTERVIEWS" };
  }

  if (
    /\b(dashboard|pipeline)\s*(summary|stats?)?\b|\b(hiring\s*)?stats?\b|\brecruitment\s+summary\b/i.test(
      m
    )
  ) {
    return { intent: "GET_DASHBOARD_SUMMARY" };
  }

  if (
    /\b(priorit(?:y|ies|ize|ized|izing|ization)?|what\s+should\s+i\s+(?:do|focus|prioritize)|needs?\s+attention|what\s+to\s+focus)\b/i.test(
      m
    )
  ) {
    return { intent: "GET_PRIORITIES" };
  }

  if (
    /\b(who\s+needs\s+follow|follow[-\s]?up\s+needed|candidates?\s+to\s+follow)\b/i.test(
      m
    )
  ) {
    return { intent: "GET_FOLLOWUP_NEEDED" };
  }

  if (
    /\bshortlist(ed)?\b|\btop\s+candidates?\b(?!\s+for\b)/i.test(m)
  ) {
    return { intent: "GET_SHORTLISTED" };
  }

  return null;
}

async function detectIntent(
  userMessage: string
): Promise<DetectedIntentResult | null> {
  const localMatch = fallbackDetectJobIntent(userMessage);
  if (localMatch) {
    console.debug("[intent-debug] local parser matched, skipping OpenClaw:", localMatch);
    return localMatch;
  }

  const webhookUrl = process.env.OPENCLAW_WEBHOOK_URL;
  const token = process.env.OPENCLAW_HOOKS_TOKEN;

  if (!webhookUrl || !token) {
    console.error("OpenClaw env vars missing for intent detection");
    return fallbackDetectSimpleIntent(userMessage);
  }

  const prompt = `${INTENT_DETECTION_PROMPT}\n\nUser message: "${userMessage}"`;

  let res: globalThis.Response;
  try {
    res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message: prompt,
        name: "Recruiter Intent Detection",
        agentId: "main",
        wakeMode: "now",
        deliver: false,
      }),
    });
  } catch (err) {
    console.error("OpenClaw fetch threw:", err);
    return fallbackDetectSimpleIntent(userMessage);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(`Intent detection failed: ${res.status} – ${errText}`);
    return fallbackDetectSimpleIntent(userMessage);
  }

  const body = await res.json().catch(() => null);
  const raw: string | undefined =
    body?.output ?? body?.message ?? body?.result;
  console.debug("[intent-debug] raw OpenClaw response:", raw);

  if (!raw) {
    return fallbackDetectSimpleIntent(userMessage);
  }

  try {
    const cleaned = raw.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned) as DetectedIntentResult;
    const intent = parsed.intent?.toUpperCase() as OpenClawIntent;
    console.debug("[intent-debug] parsed intent:", { intent, jobName: parsed.jobName });

    if (!VALID_INTENTS.includes(intent)) {
      return fallbackDetectSimpleIntent(userMessage);
    }

    if (intent === "GET_JOB_TOP_CANDIDATES" && !parsed.jobName?.trim()) {
      const fb = fallbackDetectJobIntent(userMessage);
      if (fb?.jobName) {
        return { intent: "GET_JOB_TOP_CANDIDATES", jobName: fb.jobName };
      }
    }

    return { intent, jobName: parsed.jobName };
  } catch {
    console.debug("[intent-debug] JSON parse failed, trying fallback");
    return fallbackDetectSimpleIntent(userMessage);
  }
}

async function fetchSimpleIntentData(
  intent: OpenClawIntent
): Promise<unknown> {
  const apiBaseUrl =
    process.env.BACKEND_API_BASE_URL?.replace(/\/$/, "") ||
    "http://localhost:5000";

  const res = await fetch(`${apiBaseUrl}/api/openclaw/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent }),
  });

  const body = (await res.json().catch(() => null)) as QueryApiResponse | null;
  if (!res.ok || !body?.success) {
    throw new Error(
      body?.message || `OpenClaw query API failed (${res.status})`
    );
  }

  return body.data;
}

async function resolveJobAndGetTopCandidates(
  jobName: string | undefined
): Promise<{ reply: string; metadata?: ChatTurnMetadata }> {
  if (!jobName?.trim()) {
    return {
      reply:
        "Please mention a job role, e.g. \"top candidates for Frontend Developer\".",
    };
  }

  const matches: JobSearchItem[] = await searchJobs(jobName.trim(), 5);

  if (matches.length === 0) {
    return {
      reply: `I couldn't find a matching job role for "${jobName}".`,
    };
  }

  let job: JobSearchItem;
  if (matches.length === 1) {
    job = matches[0];
  } else {
    const exactMatch = matches.find(
      (j) => j.title.toLowerCase() === jobName.trim().toLowerCase()
    );
    if (exactMatch) {
      job = exactMatch;
    } else {
      const lines = [
        "I found multiple matching roles:",
        "",
        ...matches.map((j, i) => `${i + 1}. ${j.title}`),
        "",
        "Reply with the exact role name you want.",
      ];
      return { reply: lines.join("\n") };
    }
  }

  const candidates: TopCandidateItem[] = await getJobTopCandidates(job.id, 3);
  const reply = formatTopCandidatesForJob(job.title, candidates);
  const metadata = buildJobTopMetadata(job.id, job.title, candidates);
  return { reply, metadata };
}

function formatTopCandidatesForJob(
  jobTitle: string,
  candidates: TopCandidateItem[]
): string {
  if (!candidates.length) {
    return `No scored candidates found for ${jobTitle}.`;
  }

  const lines = [`🏆 Top Candidates — ${jobTitle}`, ""];
  candidates.forEach((c, i) => {
    lines.push(
      `${i + 1}. ${c.candidateName}`,
      `   Score: ${c.aiScore ?? "N/A"}`,
      `   Recommendation: ${c.aiRecommendation ?? "N/A"}`,
      `   Status: ${c.status}`,
      ""
    );
  });
  return lines.join("\n").trim();
}

/**
 * Best-effort Telegram delivery via OpenClaw. Never throws — web/API callers
 * must still get a normal JSON reply even if OpenClaw is down (ECONNREFUSED).
 */
async function sendTelegramReply(text: string): Promise<void> {
  // Prefer direct Telegram Bot API delivery so OpenClaw/Gemini isn't invoked a
  // second time for every backend-produced reply.
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramTo = process.env.OPENCLAW_TELEGRAM_TO; // e.g. `telegram:853...`

  const chatId = (() => {
    if (!telegramTo) return null;
    const s = telegramTo.trim();
    if (!s) return null;
    if (s.toLowerCase().startsWith("telegram:")) return s.slice("telegram:".length);
    return s;
  })();

  if (botToken && chatId) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            disable_web_page_preview: true,
          }),
        }
      );

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn(
          `Telegram sendMessage failed: ${res.status} – ${errText.slice(0, 200)}`
        );
      }
      return;
    } catch (err) {
      console.warn(
        "Telegram direct delivery failed (will fallback to OpenClaw):",
        err instanceof Error ? err.message : err
      );
      // fall through to OpenClaw webhook fallback
    }
  }

  // Fallback: route the message through OpenClaw telegram delivery.
  // This should rarely be needed, but keeps backward compatibility.
  const webhookUrl = process.env.OPENCLAW_WEBHOOK_URL;
  const token = process.env.OPENCLAW_HOOKS_TOKEN;
  if (!webhookUrl || !token || !telegramTo) return;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message: text,
        name: "Recruiter Chatbot Reply",
        agentId: "main",
        wakeMode: "now",
        deliver: true,
        channel: "telegram",
        to: telegramTo,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(
        `Telegram/OpenClaw reply failed: ${res.status} – ${errText.slice(0, 200)}`
      );
    }
  } catch (err) {
    console.warn(
      "Telegram/OpenClaw unreachable (chat reply still returned to client):",
      err instanceof Error ? err.message : err
    );
  }
}

function formatPriorities(items: PriorityItem[]): string {
  if (!items.length) return "Nothing urgent right now — pipeline is clear!";

  const lines: string[] = ["📋 Your Priorities Today", ""];

  for (const item of items) {
    switch (item.kind) {
      case "stale_screened":
        lines.push(
          `⏳ ${item.candidateName} — ${item.jobTitle} (screened ${item.daysSinceUpdate}d ago, needs review)`
        );
        break;
      case "today_interview":
        lines.push(
          `📅 ${item.candidateName} — ${item.jobTitle} (interview today, ${item.mode})`
        );
        break;
      case "shortlisted_no_interview":
        lines.push(
          `🔔 ${item.candidateName} — ${item.jobTitle} (shortlisted, no interview scheduled)`
        );
        break;
      case "recent_application":
        lines.push(
          `📥 ${item.candidateName} — ${item.jobTitle} (new application)`
        );
        break;
    }
  }

  return lines.join("\n").trim();
}

function formatFollowUps(items: FollowUpItem[]): string {
  if (!items.length) return "No candidates need follow-up right now.";

  const lines: string[] = ["🔔 Candidates Needing Follow-Up", ""];
  items.forEach((item, i) => {
    const interviewNote = item.hasScheduledInterview
      ? "interview scheduled"
      : "no interview";
    lines.push(
      `${i + 1}. ${item.candidateName} — ${item.jobTitle}`,
      `   Status: ${item.status} · Last activity: ${item.daysSinceLastActivity}d ago · ${interviewNote}`,
      ""
    );
  });

  return lines.join("\n").trim();
}

// ── SIMPLE path (deterministic) ──────────────────────────────────────────────

async function runSimpleQuery(
  userMessage: string
): Promise<ChatHandlerResult> {
  const detected = await detectIntent(userMessage);
  if (!detected) {
    const reply =
      "Sorry, I can help with: shortlisted candidates, today's interviews, dashboard summary, priorities, follow-ups, and top candidates for a role.";
    return { reply, mode: "SIMPLE_QUERY" };
  }

  const { intent } = detected;

  try {
    switch (intent as OpenClawIntent) {
      case "GET_SHORTLISTED":
      case "GET_TODAY_INTERVIEWS":
      case "GET_DASHBOARD_SUMMARY": {
        const data = await fetchSimpleIntentData(intent as OpenClawIntent);
        const reply = formatOpenClawResponse(intent as OpenClawIntent, data);

        if (intent === "GET_SHORTLISTED" && Array.isArray(data)) {
          const metadata: ChatTurnMetadata = {
            kind: "SHORTLISTED",
            items: data.map((row: Record<string, unknown>) => ({
              applicationId: String(row.applicationId),
              fullName: String(row.fullName),
              jobTitle: String(row.jobTitle),
              aiScore: (row.aiScore as number | null) ?? null,
              aiRecommendation: (row.aiRecommendation as string | null) ?? null,
              status: String(row.status),
            })),
          };
          return { reply, metadata, mode: "SIMPLE_QUERY" };
        }

        if (intent === "GET_TODAY_INTERVIEWS" && Array.isArray(data)) {
          const metadata: ChatTurnMetadata = {
            kind: "TODAY_INTERVIEWS",
            items: data.map((row: Record<string, unknown>) => ({
              applicationId: String(row.applicationId),
              candidateName: String(row.candidateName),
              jobTitle: String(row.jobTitle),
              scheduledAt: new Date(
                row.scheduledAt as string | Date
              ).toISOString(),
              mode: String(row.mode),
              status: String(row.status),
            })),
          };
          return { reply, metadata, mode: "SIMPLE_QUERY" };
        }

        if (intent === "GET_DASHBOARD_SUMMARY" && data && typeof data === "object") {
          const d = data as Record<string, number>;
          const metadata: ChatTurnMetadata = {
            kind: "DASHBOARD_SUMMARY",
            totalApplications: d.totalApplications,
            shortlisted: d.shortlisted,
            interview: d.interview,
            hired: d.hired,
            rejected: d.rejected,
          };
          return { reply, metadata, mode: "SIMPLE_QUERY" };
        }

        return { reply, mode: "SIMPLE_QUERY" };
      }

      case "GET_PRIORITIES": {
        const items = await getRecruiterPriorities();
        const reply = formatPriorities(items);
        const metadata: ChatTurnMetadata = {
          kind: "PRIORITIES",
          items: items.map((it) => ({
            kind: it.kind,
            applicationId: it.applicationId,
            candidateName: it.candidateName,
            jobTitle: it.jobTitle,
            detail:
              it.kind === "stale_screened"
                ? `${it.daysSinceUpdate}d in screened`
                : it.kind === "today_interview"
                  ? String(it.scheduledAt)
                  : it.kind === "shortlisted_no_interview"
                    ? "no interview"
                    : it.kind === "recent_application"
                      ? String(it.appliedAt)
                      : undefined,
          })),
        };
        return { reply, metadata, mode: "SIMPLE_QUERY" };
      }

      case "GET_FOLLOWUP_NEEDED": {
        const items = await getFollowUpNeeded();
        const reply = formatFollowUps(items);
        const metadata: ChatTurnMetadata = {
          kind: "FOLLOWUP_NEEDED",
          items: items.map((it) => ({
            applicationId: it.applicationId,
            candidateName: it.candidateName,
            jobTitle: it.jobTitle,
            status: it.status,
            aiScore: it.aiScore,
            daysSinceLastActivity: it.daysSinceLastActivity,
            hasScheduledInterview: it.hasScheduledInterview,
          })),
        };
        return { reply, metadata, mode: "SIMPLE_QUERY" };
      }

      case "GET_JOB_TOP_CANDIDATES": {
        const { reply, metadata } = await resolveJobAndGetTopCandidates(
          detected.jobName
        );
        return { reply, metadata, mode: "SIMPLE_QUERY" };
      }

      default:
        return {
          reply: "Sorry, I didn't understand that.",
          mode: "SIMPLE_QUERY",
        };
    }
  } catch (err) {
    console.error("Chatbot data fetch error:", err);
    return {
      reply: "Sorry, I couldn't fetch data right now.",
      mode: "SIMPLE_QUERY",
    };
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

export type RecruiterChatInput = {
  message: string;
  history?: ChatHistoryItem[];
};

/**
 * Hybrid handler: deterministic ATS when possible; LLM + structured context for follow-ups.
 */
export async function handleRecruiterChatMessage(
  input: RecruiterChatInput
): Promise<ChatHandlerResult> {
  const userMessage = input.message.trim();
  const history = input.history ?? [];

  const mode = classifyChatQuery(userMessage, history);

  if (mode === "REASONING_QUERY") {
    const resolved = await resolveReasoningAtsContext(userMessage, history);
    const reply = await generateRecruiterCopilotReply({
      userMessage,
      history,
      atsContextBlock: resolved.contextBlock,
    });
    await sendTelegramReply(reply);
    return { reply, mode: "REASONING_QUERY" };
  }

  const result = await runSimpleQuery(userMessage);
  await sendTelegramReply(result.reply);
  return result;
}
