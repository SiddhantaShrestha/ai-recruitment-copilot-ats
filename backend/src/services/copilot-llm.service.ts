// ---------------------------------------------------------------------------
// Copilot LLM — Gemini-powered reasoning / drafting on top of ATS context.
//
// The model must NOT invent ATS facts; it only interprets the provided block.
// ---------------------------------------------------------------------------

import type { ChatHistoryItem } from "../types/chat.types";

const SYSTEM_INSTRUCTION = `You are an AI recruiter copilot for Recruit Nepal.

Rules:
- Use ONLY the facts in the latest ATS CONTEXT section and prior conversation. Do not invent candidates, scores, jobs, or interviews.
- If context is insufficient, say what is missing in one short sentence.
- Be practical, concise, and recruiter-focused. No JSON, no markdown tables.
- For drafts: output ready-to-send message text (short email or DM), professional and warm.
- For comparisons: be balanced; cite only facts from context.
- For "why" questions: tie reasoning explicitly to provided scores, notes, status, and answers.`;

function trimHistory(
  history: ChatHistoryItem[],
  maxTurns = 12
): ChatHistoryItem[] {
  return history.slice(-maxTurns).map((h) => ({
    role: h.role,
    content: h.content.slice(0, 8000),
    metadata: h.metadata,
  }));
}

function buildFinalUserText(
  userMessage: string,
  atsContextBlock: string
): string {
  return [
    "ATS CONTEXT (facts — do not contradict or extend beyond this):",
    "---",
    atsContextBlock,
    "---",
    "",
    "Recruiter message:",
    userMessage,
  ].join("\n");
}

export async function generateRecruiterCopilotReply(params: {
  userMessage: string;
  /** Prior turns only (exclude the current user message). */
  history: ChatHistoryItem[];
  atsContextBlock: string;
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return "Copilot reasoning is unavailable (GEMINI_API_KEY is not set).";
  }

  const model =
    process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";

  const history = trimHistory(params.history);

  const contents: Array<{
    role: string;
    parts: Array<{ text: string }>;
  }> = [];

  for (const turn of history) {
    if (turn.role === "user") {
      contents.push({
        role: "user",
        parts: [{ text: turn.content }],
      });
    } else {
      contents.push({
        role: "model",
        parts: [{ text: turn.content }],
      });
    }
  }

  contents.push({
    role: "user",
    parts: [
      {
        text: buildFinalUserText(
          params.userMessage,
          params.atsContextBlock
        ),
      },
    ],
  });

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }],
      },
      contents,
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("Copilot LLM error:", response.status, body.slice(0, 500));
    return "Sorry, I couldn't generate a reply right now. Try again shortly.";
  }

  const json = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
    "";

  if (!text.trim()) {
    return "Sorry, the model returned an empty reply.";
  }

  return text.trim();
}
