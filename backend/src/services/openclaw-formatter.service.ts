// ---------------------------------------------------------------------------
// OpenClaw Formatter — Telegram message formatting for the chatbot flow.
//
// Formats simple fetch results into recruiter-friendly Telegram text.
// For higher-value copilot formatting, build separate formatters as needed.
// ---------------------------------------------------------------------------

import type {
  OpenClawIntent,
  OpenClawShortlistedItem,
  OpenClawTodayInterviewItem,
  OpenClawDashboardSummary,
} from "./openclaw.service";

function formatTime(value: string | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatShortlisted(items: OpenClawShortlistedItem[]): string {
  if (!items.length) return "No shortlisted candidates found.";

  const lines: string[] = ["🔥 Top Shortlisted Candidates", ""];
  items.forEach((item, idx) => {
    lines.push(
      `${idx + 1}. ${item.fullName} — ${item.jobTitle}`,
      `   Score: ${item.aiScore ?? "N/A"}`,
      `   Recommendation: ${item.aiRecommendation ?? "N/A"}`,
      `   Status: ${item.status}`,
      ""
    );
  });

  return lines.join("\n").trim();
}

function formatTodayInterviews(items: OpenClawTodayInterviewItem[]): string {
  if (!items.length) return "No interviews scheduled for today.";

  const lines: string[] = ["📅 Today's Interviews", ""];
  items.forEach((item, idx) => {
    lines.push(
      `${idx + 1}. ${item.candidateName} — ${item.jobTitle}`,
      `   Time: ${formatTime(item.scheduledAt)}`,
      `   Mode: ${item.mode}`,
      `   Status: ${item.status}`,
      ""
    );
  });

  return lines.join("\n").trim();
}

function formatDashboardSummary(data: OpenClawDashboardSummary): string {
  if (
    !data ||
    typeof data.totalApplications !== "number" ||
    typeof data.shortlisted !== "number" ||
    typeof data.interview !== "number" ||
    typeof data.hired !== "number" ||
    typeof data.rejected !== "number"
  ) {
    return "No dashboard data available right now.";
  }

  return [
    "📊 Recruitment Dashboard Summary",
    "",
    `Total Applications: ${data.totalApplications}`,
    `Shortlisted: ${data.shortlisted}`,
    `Interview: ${data.interview}`,
    `Hired: ${data.hired}`,
    `Rejected: ${data.rejected}`,
  ].join("\n");
}

export function formatOpenClawResponse(
  intent: OpenClawIntent,
  data: unknown
): string {
  switch (intent) {
    case "GET_SHORTLISTED":
      return formatShortlisted(
        (data as OpenClawShortlistedItem[] | undefined) ?? []
      );
    case "GET_TODAY_INTERVIEWS":
      return formatTodayInterviews(
        (data as OpenClawTodayInterviewItem[] | undefined) ?? []
      );
    case "GET_DASHBOARD_SUMMARY":
      return formatDashboardSummary(
        (data as OpenClawDashboardSummary) ?? {
          totalApplications: Number.NaN,
          shortlisted: Number.NaN,
          interview: Number.NaN,
          hired: Number.NaN,
          rejected: Number.NaN,
        }
      );
    default:
      return "Sorry, I didn't understand that.";
  }
}
