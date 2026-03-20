import { prisma } from "../lib/prisma";

type AiRecommendation = "SHORTLIST" | "MAYBE" | "REJECT";

function isAiRecommendation(value: unknown): value is AiRecommendation {
  return (
    value === "SHORTLIST" || value === "MAYBE" || value === "REJECT"
  );
}

/**
 * Extract the first balanced `{ ... }` block from text, respecting strings so nested
 * `}` inside "summary" does not break extraction.
 */
function extractFirstBalancedJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;

    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function stripMarkdownJsonFence(text: string): string {
  const t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return t;
}

function extractJsonFromText(text: string): unknown {
  let candidate = stripMarkdownJsonFence(text);

  const tryParse = (s: string): unknown | null => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  let parsed = tryParse(candidate);
  if (parsed != null) return parsed;

  const balanced = extractFirstBalancedJsonObject(candidate);
  if (balanced) {
    parsed = tryParse(balanced);
    if (parsed != null) return parsed;
  }

  // Legacy fallback: first { to last } (can fail on nested braces in strings — balanced path is preferred)
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    parsed = tryParse(candidate.slice(start, end + 1));
    if (parsed != null) return parsed;
  }

  const preview = text.slice(0, 400).replace(/\s+/g, " ");
  throw new Error(
    `Failed to parse JSON from Gemini response. Preview: ${preview}`
  );
}

export async function evaluateApplicationWithAI(
  applicationId: string
): Promise<any> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const model =
    process.env.GEMINI_MODEL?.trim() || "gemini-1.5-flash-latest";

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      candidate: true,
      job: true,
      answers: {
        include: {
          screeningQuestion: true,
        },
      },
    },
  });

  if (!application) {
    throw new Error("Application not found");
  }

  if (!application.answers || application.answers.length === 0) {
    throw new Error(
      "Cannot evaluate application without screening answers."
    );
  }

  const job = application.job;
  const candidate = application.candidate;

  const applicationAnswers = application.answers as Array<{
    answer: string;
    screeningQuestion: {
      order: number;
      question: string;
    };
  }>;

  const answersText =
    applicationAnswers
      .slice()
      .sort(
        (a, b) => a.screeningQuestion.order - b.screeningQuestion.order
      )
      .map((a) => {
        const q = a.screeningQuestion.question;
        return `- ${q}\n  Answer: ${a.answer}`;
      })
      .join("\n") || "(No answers provided)";

  const prompt = [
    "You are an expert recruitment evaluator.",
    "Evaluate the candidate based ONLY on the provided job details and screening answers.",
    "",
    "Return STRICT JSON only (no markdown, no commentary) with exactly these keys:",
    "{",
    '  "score": number,',
    '  "summary": string,',
    '  "recommendation": "SHORTLIST" | "MAYBE" | "REJECT"',
    "}",
    "",
    "Rules:",
    "- score should be a number from 0 to 100 (higher is better).",
    "- summary should be short (1-3 sentences).",
    "- recommendation must match one of the allowed strings.",
    "",
    "Job:",
    `- Title: ${job.title}`,
    `- Department: ${job.department ?? "N/A"}`,
    `- Location: ${job.location ?? "N/A"}`,
    `- Description: ${job.description ?? "N/A"}`,
    "",
    "Candidate:",
    `- Name: ${candidate.fullName}`,
    `- Email: ${candidate.email}`,
    "",
    "Screening Answers:",
    answersText,
  ].join("\n");

  const modelsToTry = [model];

  let lastError: unknown;
  let gemini: any | null = null;

  for (const candidateModel of modelsToTry) {
    try {
      const url =
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          candidateModel
        )}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            // Screen summaries can be long; truncation causes invalid JSON and parse failures.
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
          },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        // Retry only on 404 (model/endpoint not found). For other statuses, fail fast.
        if (response.status === 404) {
          lastError = new Error(
            `Gemini API error (model=${candidateModel}): ${response.status} ${response.statusText}. Body: ${errorBody.slice(
              0,
              800
            )}`
          );
          continue;
        }

        throw new Error(
          `Gemini API error (model=${candidateModel}): ${response.status} ${response.statusText}. Body: ${errorBody.slice(
            0,
            800
          )}`
        );
      }

      gemini = (await response.json()) as any;
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!gemini) {
    const msg =
      lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`Gemini evaluation failed: ${msg}`);
  }

  const candidate0 = gemini?.candidates?.[0];
  const finishReason = candidate0?.finishReason as string | undefined;
  if (
    finishReason === "SAFETY" ||
    finishReason === "RECITATION" ||
    finishReason === "BLOCKLIST"
  ) {
    throw new Error(
      `Gemini blocked the response (finishReason=${finishReason}).`
    );
  }

  const parts = candidate0?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((p: { text?: string }) => p?.text ?? "").join("")
    : "";

  if (!text.trim()) {
    throw new Error("Gemini returned an empty response.");
  }

  const parsed = extractJsonFromText(text) as any;

  const rawScore =
    typeof parsed?.score === "number" ? parsed.score : undefined;
  const summary =
    typeof parsed?.summary === "string" ? parsed.summary : undefined;
  const recommendation = parsed?.recommendation;

  if (
    rawScore === undefined ||
    !Number.isFinite(rawScore) ||
    summary === undefined ||
    !isAiRecommendation(recommendation)
  ) {
    throw new Error("Gemini response JSON did not match expected schema.");
  }

  // Safe score clamp (Gemini can drift outside the requested range).
  const score = Math.max(0, Math.min(100, rawScore));

  const updatedApplication = await prisma.application.update({
    where: { id: applicationId },
    data: {
      aiScore: score,
      aiSummary: summary,
      aiRecommendation: recommendation,
    },
    include: {
      candidate: true,
      job: true,
      answers: {
        include: {
          screeningQuestion: true,
        },
      },
    },
  });

  return updatedApplication;
}

