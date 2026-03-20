// ---------------------------------------------------------------------------
// Chat classifier — SIMPLE_QUERY vs REASONING_QUERY (lightweight rules).
//
// Deterministic ATS pulls stay SIMPLE; explanations, compare, drafts, ordinals
// with history → REASONING (LLM + structured context).
// ---------------------------------------------------------------------------

import type { ChatHistoryItem, ChatMode } from "../types/chat.types";

/** Strong signals for a first-turn factual pull (no LLM). */
const SIMPLE_JOB_TOP =
  /\b(?:best|top|strongest|highest[\s-]?scored?)\s+candidates?\s+for\s+/i;
const SIMPLE_JOB_TOP_ALT =
  /\b(?:best|top)\s+people\s+for\s+/i;
const SIMPLE_WHO_BEST =
  /\bwho\s+(?:are|is)\s+the\s+best\s+(?:candidates?\s+)?for\s+/i;
const SIMPLE_TOP_N_FOR = /\btop\s+\d*\s*(?:candidates?\s+)?for\s+/i;
const SIMPLE_BEST_CANDIDATE_FOR =
  /\b(?:best|top)\s+candidate\s+for\s+/i;

const SIMPLE_DASHBOARD =
  /\b(dashboard|pipeline)\s*(summary|stats?)?\b|\b(hiring\s*)?stats?\b|\brecruitment\s+summary\b/i;
const SIMPLE_SHORTLISTED =
  /\bshortlist(ed)?\b|\btop\s+candidates?\b(?!\s+for\b)/i;
const SIMPLE_TODAY_IV =
  /\b(interviews?\s+today|today'?s?\s+interviews?)\b/i;
// Include "prioritize", "priorities" — `\bpriorit\b` wrongly fails on "prioritize" (no boundary before "i")
const SIMPLE_PRIORITIES =
  /\b(priorit(?:y|ies|ize|ized|izing|ization)?|what\s+should\s+i\s+(?:do|focus|prioritize)|needs?\s+attention|what\s+to\s+focus)\b/i;
const SIMPLE_FOLLOWUP_LIST =
  /\b(who\s+needs\s+follow|follow[-\s]?up\s+needed|candidates?\s+to\s+follow)\b/i;

/** Signals that we should use LLM + ATS context. */
const REASONING_COMPARE =
  /\bcompare\b|\bversus\b|\bvs\.?\b|side[\s-]by[\s-]side/i;
const REASONING_WHY =
  /\bwhy\b|\bhow\s+come\b|\breason\b|\bexplain\b|\bwhat\s+makes\b|\bbetter\s+than\b/i;
const REASONING_DRAFT =
  /\bdraft\b|\bwrite\s+(a\s+)?(email|message)\b|\bsofter\b|\brewrite\b|\btone\b|\bmessage\s+to\s+send\b/i;
const REASONING_RISK =
  /\brisk\b|\bconcern\b|\bred\s+flag\b|\bweak(ness)?\b/i;
const REASONING_SUGGEST =
  /\bwhat\s+do\s+you\s+think\b|\bsuggest\b|\badvise\b|\bopinion\b/i;

const ORDINAL_FOLLOWUP =
  /\b(first|second|third|1st|2nd|3rd|last)\b|\bfirst\s+two\b|\btop\s+two\b|\bboth(\s+of\s+them)?\b|\bthis\s+candidate\b|\bthat\s+one\b|\bthe\s+second\b|\bthe\s+first\b/i;

function isStrongSimpleMessage(message: string): boolean {
  const m = message.trim();
  return (
    SIMPLE_JOB_TOP.test(m) ||
    SIMPLE_BEST_CANDIDATE_FOR.test(m) ||
    SIMPLE_JOB_TOP_ALT.test(m) ||
    SIMPLE_WHO_BEST.test(m) ||
    SIMPLE_TOP_N_FOR.test(m) ||
    SIMPLE_DASHBOARD.test(m) ||
    SIMPLE_SHORTLISTED.test(m) ||
    SIMPLE_TODAY_IV.test(m) ||
    SIMPLE_PRIORITIES.test(m) ||
    SIMPLE_FOLLOWUP_LIST.test(m)
  );
}

function isReasoningMessage(message: string): boolean {
  const m = message.trim();
  return (
    REASONING_COMPARE.test(m) ||
    REASONING_WHY.test(m) ||
    REASONING_DRAFT.test(m) ||
    REASONING_RISK.test(m) ||
    REASONING_SUGGEST.test(m) ||
    ORDINAL_FOLLOWUP.test(m)
  );
}

function hasAssistantTurn(history: ChatHistoryItem[]): boolean {
  return history.some((h) => h.role === "assistant" && h.content.trim());
}

/**
 * Classify the current user message. Strong simple patterns win over weak reasoning overlap.
 * Short ordinal follow-ups after an assistant reply default to REASONING.
 */
export function classifyChatQuery(
  message: string,
  history: ChatHistoryItem[]
): ChatMode {
  const trimmed = message.trim();
  if (!trimmed) return "SIMPLE_QUERY";

  if (isStrongSimpleMessage(trimmed) && !isReasoningMessage(trimmed)) {
    return "SIMPLE_QUERY";
  }

  if (isReasoningMessage(trimmed)) {
    return "REASONING_QUERY";
  }

  if (hasAssistantTurn(history) && ORDINAL_FOLLOWUP.test(trimmed)) {
    return "REASONING_QUERY";
  }

  // Vague follow-up questions with "?" — but not known simple asks (fixed by isStrongSimple above)
  if (
    hasAssistantTurn(history) &&
    trimmed.length <= 120 &&
    /\?/.test(trimmed) &&
    !isStrongSimpleMessage(trimmed)
  ) {
    return "REASONING_QUERY";
  }

  return "SIMPLE_QUERY";
}
