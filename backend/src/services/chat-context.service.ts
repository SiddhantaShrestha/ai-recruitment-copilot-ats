// ---------------------------------------------------------------------------
// Chat context resolution — builds structured ATS context for REASONING_QUERY.
//
// Uses assistant metadata when present; falls back to parsing numbered lists
// from the last assistant message + fuzzy name lookup in Prisma.
// ---------------------------------------------------------------------------

import { prisma } from "../lib/prisma";
import type { ChatHistoryItem, ChatTurnMetadata } from "../types/chat.types";
import {
  compareCandidates,
  getFollowUpContext,
  type ComparisonPayload,
  type FollowUpContext,
} from "./copilot.service";

export type ResolvedAtsContext = {
  /** Human-readable block for the LLM (facts only). */
  contextBlock: string;
  /** True if we had enough ATS data to answer meaningfully. */
  sufficient: boolean;
};

function serializeComparison(payload: ComparisonPayload): string {
  const ser = (label: string, s: ComparisonPayload["a"]) =>
    [
      `### ${label}: ${s.candidateName}`,
      `Application ID: ${s.applicationId}`,
      `Job: ${s.jobTitle}`,
      `Status: ${s.status}`,
      `AI score: ${s.aiScore ?? "N/A"}`,
      `AI recommendation: ${s.aiRecommendation ?? "N/A"}`,
      `AI summary: ${s.aiSummary ?? "N/A"}`,
      `Notes (recent):`,
      ...s.notes.map((n) => `- (${n.createdAt.toISOString()}) ${n.content}`),
      `Screening Q&A:`,
      ...s.answers.map((a) => `- Q: ${a.question}\n  A: ${a.answer}`),
    ].join("\n");

  return [ser("Candidate A", payload.a), "", ser("Candidate B", payload.b)].join(
    "\n"
  );
}

function serializeFollowUp(ctx: FollowUpContext): string {
  return [
    `### Follow-up context: ${ctx.candidateName}`,
    `Application ID: ${ctx.applicationId}`,
    `Email: ${ctx.candidateEmail}`,
    `Phone: ${ctx.candidatePhone ?? "N/A"}`,
    `Job: ${ctx.jobTitle}`,
    `Status: ${ctx.status}`,
    `AI score: ${ctx.aiScore ?? "N/A"}`,
    `AI recommendation: ${ctx.aiRecommendation ?? "N/A"}`,
    `AI summary: ${ctx.aiSummary ?? "N/A"}`,
    `Latest notes:`,
    ...ctx.latestNotes.map((n) => `- (${n.createdAt.toISOString()}) ${n.content}`),
    `Interviews:`,
    ...ctx.interviews.map(
      (i) =>
        `- ${i.scheduledAt.toISOString()} mode=${i.mode} status=${i.status}`
    ),
    `Recent activity:`,
    ...ctx.recentActivity.map(
      (a) => `- (${a.createdAt.toISOString()}) ${a.type}: ${a.title} — ${a.description}`
    ),
  ].join("\n");
}

function findLastMetadata(history: ChatHistoryItem[]): ChatTurnMetadata | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.role === "assistant" && h.metadata) return h.metadata;
  }
  return null;
}

function findLastAssistantContent(history: ChatHistoryItem[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.role === "assistant" && h.content.trim()) return h.content;
  }
  return "";
}

/** Extract "1. Name" style lines from formatted bot replies. */
export function extractNumberedNamesFromReply(text: string): string[] {
  const names: string[] = [];
  const re = /^\s*(\d+)\.\s+([^\n—\-]+?)(?:\s*[—\-]|$)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const name = m[2].trim().replace(/\s*\(main\)\s*$/i, "").trim();
    if (name) names.push(name);
  }
  return names;
}

async function resolveApplicationIdsByNames(
  names: string[]
): Promise<string[]> {
  const ids: string[] = [];
  for (const name of names) {
    const app = await prisma.application.findFirst({
      where: {
        candidate: {
          fullName: { contains: name, mode: "insensitive" },
        },
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (app) ids.push(app.id);
  }
  return ids;
}

type OrdinalHint =
  | "first"
  | "second"
  | "third"
  | "first_two"
  | "last"
  | null;

function parseOrdinalHint(message: string): OrdinalHint {
  const m = message.toLowerCase();
  if (/\bfirst\s+two\b|\btop\s+two\b|\bboth\b|\btwo\s+of\s+them\b/i.test(m))
    return "first_two";
  if (/\bcompare\b/i.test(m) && !/\bfirst\b|\bsecond\b|\bthird\b/i.test(m))
    return "first_two";
  if (/\b(last)\b/i.test(m)) return "last";
  if (/\b(second|2nd)\b/i.test(m)) return "second";
  if (/\b(third|3rd)\b/i.test(m)) return "third";
  if (/\b(first|1st)\b/i.test(m)) return "first";
  return null;
}

function candidatesFromMetadata(meta: ChatTurnMetadata): Array<{
  applicationId: string;
  candidateName: string;
  aiScore: number | null;
  aiRecommendation: string | null;
  status: string;
  jobTitle?: string;
}> {
  switch (meta.kind) {
    case "JOB_TOP_CANDIDATES":
      return meta.candidates.map((c) => ({
        applicationId: c.applicationId,
        candidateName: c.candidateName,
        aiScore: c.aiScore,
        aiRecommendation: c.aiRecommendation,
        status: c.status,
        jobTitle: meta.jobTitle,
      }));
    case "SHORTLISTED":
      return meta.items.map((c) => ({
        applicationId: c.applicationId,
        candidateName: c.fullName,
        aiScore: c.aiScore,
        aiRecommendation: c.aiRecommendation,
        status: c.status,
        jobTitle: c.jobTitle,
      }));
    case "FOLLOWUP_NEEDED":
      return meta.items.map((c) => ({
        applicationId: c.applicationId,
        candidateName: c.candidateName,
        aiScore: c.aiScore,
        aiRecommendation: null,
        status: c.status,
        jobTitle: c.jobTitle,
      }));
    case "PRIORITIES":
      return meta.items.map((c) => ({
        applicationId: c.applicationId,
        candidateName: c.candidateName,
        aiScore: null,
        aiRecommendation: null,
        status: "",
        jobTitle: c.jobTitle,
      }));
    case "TODAY_INTERVIEWS":
      return meta.items.map((c) => ({
        applicationId: c.applicationId,
        candidateName: c.candidateName,
        aiScore: null,
        aiRecommendation: null,
        status: c.status,
        jobTitle: c.jobTitle,
      }));
    default:
      return [];
  }
}

function pickCandidatesByOrdinal(
  list: Array<{ applicationId: string; candidateName: string }>,
  hint: OrdinalHint
): { a: string; b?: string } | null {
  if (!list.length) return null;
  if (hint === "first_two" && list.length >= 2)
    return { a: list[0].applicationId, b: list[1].applicationId };
  if (hint === "first") return { a: list[0].applicationId };
  if (hint === "second" && list.length >= 2)
    return { a: list[1].applicationId };
  if (hint === "third" && list.length >= 3)
    return { a: list[2].applicationId };
  if (hint === "last" && list.length >= 1)
    return { a: list[list.length - 1].applicationId };
  return null;
}

function wantsCompare(message: string): boolean {
  return /\bcompare\b|\bversus\b|\bvs\.?\b|side[\s-]by[\s-]side/i.test(message);
}

function wantsDraft(message: string): boolean {
  return /\bdraft\b|\bwrite\s+(a\s+)?(email|message)\b|\bsofter\b|\brewrite\b|\bfollow[-\s]?up\s+(message|email|text)\b/i.test(
    message
  );
}

/**
 * Resolve ATS facts for the LLM from history + current message.
 */
export async function resolveReasoningAtsContext(
  message: string,
  history: ChatHistoryItem[]
): Promise<ResolvedAtsContext> {
  const meta = findLastMetadata(history);
  const lastReply = findLastAssistantContent(history);
  const hint = parseOrdinalHint(message);

  let list = meta ? candidatesFromMetadata(meta) : [];

  if (!list.length && lastReply) {
    const names = extractNumberedNamesFromReply(lastReply);
    const ids = await resolveApplicationIdsByNames(names.slice(0, 5));
    list = ids.map((applicationId, i) => ({
      applicationId,
      candidateName: names[i] ?? `Candidate ${i + 1}`,
      aiScore: null,
      aiRecommendation: null,
      status: "",
    }));
  }

  const blocks: string[] = [];

  if (meta?.kind === "DASHBOARD_SUMMARY") {
    blocks.push(
      "### Dashboard (facts)",
      `Total applications: ${meta.totalApplications}`,
      `Shortlisted: ${meta.shortlisted}`,
      `Interview: ${meta.interview}`,
      `Hired: ${meta.hired}`,
      `Rejected: ${meta.rejected}`
    );
  }

  if (list.length) {
    blocks.push(
      "### Recent list from assistant (facts)",
      ...list.map(
        (c, i) =>
          `${i + 1}. ${c.candidateName} | applicationId=${c.applicationId} | job=${c.jobTitle ?? "N/A"} | score=${c.aiScore ?? "N/A"} | rec=${c.aiRecommendation ?? "N/A"} | status=${c.status || "N/A"}`
      )
    );
  }

  // Compare two
  if (wantsCompare(message)) {
    const picked =
      pickCandidatesByOrdinal(list, hint ?? "first_two") ??
      (list.length >= 2
        ? { a: list[0].applicationId, b: list[1].applicationId }
        : null);
    if (picked?.b) {
      const cmp = await compareCandidates(picked.a, picked.b);
      if (cmp) {
        blocks.push("### Side-by-side comparison (facts)", serializeComparison(cmp));
        return { contextBlock: blocks.join("\n\n"), sufficient: true };
      }
    }
    return {
      contextBlock:
        blocks.join("\n\n") +
        "\n\n(Compare requested but two applications could not be resolved.)",
      sufficient: false,
    };
  }

  // Draft / follow-up for one
  if (wantsDraft(message)) {
    const picked =
      pickCandidatesByOrdinal(list, hint) ??
      pickCandidatesByOrdinal(list, "first");
    if (picked?.a) {
      const ctx = await getFollowUpContext(picked.a);
      if (ctx) {
        blocks.push("### Draft context (facts)", serializeFollowUp(ctx));
        return { contextBlock: blocks.join("\n\n"), sufficient: true };
      }
    }
    return {
      contextBlock:
        blocks.join("\n\n") +
        "\n\n(Draft requested but application context could not be loaded.)",
      sufficient: false,
    };
  }

  // Why / risk / explain — enrich primary target with follow-up context
  const picked =
    pickCandidatesByOrdinal(list, hint ?? "first") ??
    (list.length ? { a: list[0].applicationId } : null);
  if (picked?.a) {
    const ctx = await getFollowUpContext(picked.a);
    if (ctx) {
      blocks.push("### Primary candidate detail (facts)", serializeFollowUp(ctx));
      return { contextBlock: blocks.join("\n\n"), sufficient: true };
    }
  }

  if (blocks.length) {
    return { contextBlock: blocks.join("\n\n"), sufficient: list.length > 0 };
  }

  return {
    contextBlock:
      "(No structured ATS list or metadata found in recent turns. Ask for a list first, e.g. top candidates for a role.)",
    sufficient: false,
  };
}

/**
 * Build metadata for a simple reply (for client to echo on next turn).
 */
export function buildJobTopMetadata(
  jobId: string,
  jobTitle: string,
  candidates: Array<{
    applicationId: string;
    candidateName: string;
    aiScore: number | null;
    aiRecommendation: string | null;
    status: string;
  }>
): ChatTurnMetadata {
  return {
    kind: "JOB_TOP_CANDIDATES",
    jobId,
    jobTitle,
    candidates,
  };
}
