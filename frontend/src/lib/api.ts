import type { ApplicationListItem, ApplicationStatus } from "@/types/application";
import type {
  CopilotChatApiResponse,
  CopilotChatHistoryItem,
} from "@/types/copilot-chat";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:5000";

const AUTH_TOKEN_KEY = "auth_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token == null) localStorage.removeItem(AUTH_TOKEN_KEY);
  else localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...authHeaders() };
}

type ApiSuccess<T> = { success: true; data: T };
type ApiError = { success: false; message?: string };

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------

export type AuthUser = { id: string; fullName: string; email: string };

export type LoginResponse = { token: string; user: AuthUser };

export async function loginWithPassword(
  email: string,
  password: string
): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  const body = (await parseJsonSafe(res)) as
    | ApiSuccess<LoginResponse>
    | ApiError
    | null;
  if (!res.ok || !body || (body as any).success !== true) {
    const msg =
      (body as ApiError | null)?.message || `Login failed (${res.status})`;
    throw new Error(msg);
  }
  return (body as ApiSuccess<LoginResponse>).data;
}

export async function fetchAuthMe(): Promise<AuthUser> {
  const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
    cache: "no-store",
    headers: authHeaders(),
  });
  const body = (await parseJsonSafe(res)) as ApiSuccess<AuthUser> | ApiError | null;
  if (!res.ok || !body || (body as any).success !== true) {
    const msg =
      (body as ApiError | null)?.message || `Not authenticated (${res.status})`;
    throw new Error(msg);
  }
  return (body as ApiSuccess<AuthUser>).data;
}

export type PaginationMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type ApplicationsQueryParams = {
  search?: string;
  status?: ApplicationStatus | "";
  jobId?: string;
  recommendation?: "SHORTLIST" | "MAYBE" | "REJECT" | "";
  scoreMin?: string;
  page?: number;
  limit?: number;
};

export type ApplicationsListResponse = {
  data: ApplicationListItem[];
  meta: PaginationMeta;
};

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function fetchApplications(
  params?: ApplicationsQueryParams
): Promise<ApplicationsListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.search?.trim()) searchParams.set("search", params.search.trim());
  if (params?.status) searchParams.set("status", params.status);
  if (params?.jobId?.trim()) searchParams.set("jobId", params.jobId.trim());
  if (params?.recommendation) {
    searchParams.set("recommendation", params.recommendation);
  }
  if (params?.scoreMin?.trim()) {
    searchParams.set("scoreMin", params.scoreMin.trim());
  }
  if (typeof params?.page === "number") {
    searchParams.set("page", String(params.page));
  }
  if (typeof params?.limit === "number") {
    searchParams.set("limit", String(params.limit));
  }

  const queryString = searchParams.toString();
  const url = `${API_BASE_URL}/api/applications${queryString ? `?${queryString}` : ""}`;

  const res = await fetch(url, {
    cache: "no-store",
    headers: authHeaders(),
  });

  const body = (await parseJsonSafe(res)) as
    | (ApiSuccess<ApplicationListItem[]> & { meta?: PaginationMeta })
    | ApiError
    | null;

  if (!res.ok || !body || (body as any).success !== true) {
    const msg =
      (body as ApiError | null)?.message ||
      `Failed to fetch applications (${res.status})`;
    throw new Error(msg);
  }

  const successBody = body as ApiSuccess<ApplicationListItem[]> & {
    meta?: PaginationMeta;
  };

  return {
    data: successBody.data,
    meta: successBody.meta ?? {
      total: successBody.data.length,
      page: params?.page ?? 1,
      limit: params?.limit ?? successBody.data.length,
      totalPages: 1,
    },
  };
}

export async function moveApplicationStatus(
  applicationId: string,
  status: ApplicationStatus
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/applications/${applicationId}/move`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ status }),
  });

  const body = (await parseJsonSafe(res)) as ApiSuccess<unknown> | ApiError | null;

  if (!res.ok || !body || (body as any).success !== true) {
    const msg =
      (body as ApiError | null)?.message ||
      `Failed to move status (${res.status})`;
    throw new Error(msg);
  }
}

export type BulkMoveResult = {
  updatedCount: number;
  skippedCount: number;
  updatedIds: string[];
  skipped: Array<{ id: string; reason: string }>;
};

export async function bulkMoveApplications(
  applicationIds: string[],
  status: ApplicationStatus
): Promise<BulkMoveResult> {
  const res = await fetch(`${API_BASE_URL}/api/applications/bulk-move`, {
    method: "PATCH",
    headers: jsonHeaders(),
    body: JSON.stringify({ applicationIds, status }),
  });

  const body = (await parseJsonSafe(res)) as
    | ApiSuccess<BulkMoveResult>
    | ApiError
    | null;

  if (!res.ok || !body || (body as any).success !== true) {
    const msg =
      (body as ApiError | null)?.message ||
      `Bulk move failed (${res.status})`;
    throw new Error(msg);
  }

  return (body as ApiSuccess<BulkMoveResult>).data;
}

export type ApplicationActivityItem = {
  id: string;
  applicationId: string;
  type: string;
  title: string;
  description: string;
  metadata: Record<string, unknown> | null;
  actorType: string | null;
  actorId: string | null;
  createdAt: string;
};

export async function fetchApplicationActivity(
  applicationId: string
): Promise<ApplicationActivityItem[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/applications/${applicationId}/activity`,
    { cache: "no-store", headers: authHeaders() }
  );

  const body = (await parseJsonSafe(res)) as
    | ApiSuccess<ApplicationActivityItem[]>
    | ApiError
    | null;

  if (!res.ok || !body || (body as any).success !== true) {
    const msg =
      (body as ApiError | null)?.message ||
      `Failed to fetch activity (${res.status})`;
    throw new Error(msg);
  }

  return (body as ApiSuccess<ApplicationActivityItem[]>).data;
}

export type ApplicationNoteItem = {
  id: string;
  applicationId: string;
  recruiterId: string;
  content: string;
  createdAt: string;
};

export async function fetchApplicationNotes(
  applicationId: string
): Promise<ApplicationNoteItem[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/applications/${applicationId}/notes`,
    { cache: "no-store", headers: authHeaders() }
  );

  const body = (await parseJsonSafe(res)) as
    | ApiSuccess<ApplicationNoteItem[]>
    | ApiError
    | null;

  if (!res.ok || !body || (body as any).success !== true) {
    const msg =
      (body as ApiError | null)?.message ||
      `Failed to fetch notes (${res.status})`;
    throw new Error(msg);
  }

  return (body as ApiSuccess<ApplicationNoteItem[]>).data;
}

export async function createApplicationNote(
  applicationId: string,
  content: string
): Promise<ApplicationNoteItem> {
  const res = await fetch(
    `${API_BASE_URL}/api/applications/${applicationId}/notes`,
    {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ content: content.trim() }),
    }
  );

  const body = (await parseJsonSafe(res)) as
    | ApiSuccess<ApplicationNoteItem>
    | ApiError
    | null;

  if (!res.ok || !body || (body as any).success !== true) {
    const msg =
      (body as ApiError | null)?.message ||
      `Failed to add note (${res.status})`;
    throw new Error(msg);
  }

  return (body as ApiSuccess<ApplicationNoteItem>).data;
}

// ---------------------------------------------------------------------------
// Application Interviews
// ---------------------------------------------------------------------------

export type InterviewMode = "ONLINE" | "ONSITE";
export type InterviewStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

export type ApplicationInterviewItem = {
  id: string;
  applicationId: string;
  scheduledAt: string;
  mode: InterviewMode;
  meetingLink: string | null;
  location: string | null;
  notes: string | null;
  status: InterviewStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateInterviewPayload = {
  scheduledAt: string;
  mode: InterviewMode;
  meetingLink?: string;
  location?: string;
  notes?: string;
};

export async function fetchApplicationInterviews(
  applicationId: string
): Promise<ApplicationInterviewItem[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/applications/${applicationId}/interviews`,
    { cache: "no-store", headers: authHeaders() }
  );

  const body = (await parseJsonSafe(res)) as
    | ApiSuccess<ApplicationInterviewItem[]>
    | ApiError
    | null;

  if (!res.ok || !body || (body as any).success !== true) {
    const msg =
      (body as ApiError | null)?.message ||
      `Failed to fetch interviews (${res.status})`;
    throw new Error(msg);
  }

  return (body as ApiSuccess<ApplicationInterviewItem[]>).data;
}

export async function createApplicationInterview(
  applicationId: string,
  payload: CreateInterviewPayload
): Promise<ApplicationInterviewItem> {
  const res = await fetch(
    `${API_BASE_URL}/api/applications/${applicationId}/interviews`,
    {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        scheduledAt: payload.scheduledAt,
        mode: payload.mode,
        meetingLink: payload.meetingLink ?? "",
        location: payload.location ?? "",
        notes: payload.notes ?? "",
      }),
    }
  );

  const body = (await parseJsonSafe(res)) as
    | ApiSuccess<ApplicationInterviewItem>
    | ApiError
    | null;

  if (!res.ok || !body || (body as any).success !== true) {
    const msg =
      (body as ApiError | null)?.message ||
      `Failed to schedule interview (${res.status})`;
    throw new Error(msg);
  }

  return (body as ApiSuccess<ApplicationInterviewItem>).data;
}

export async function updateInterviewStatus(
  interviewId: string,
  status: InterviewStatus
): Promise<ApplicationInterviewItem> {
  const res = await fetch(
    `${API_BASE_URL}/api/interviews/${interviewId}/status`,
    {
      method: "PATCH",
      headers: jsonHeaders(),
      body: JSON.stringify({ status }),
    }
  );

  const body = (await parseJsonSafe(res)) as
    | ApiSuccess<ApplicationInterviewItem>
    | ApiError
    | null;

  if (!res.ok || !body || (body as any).success !== true) {
    const msg =
      (body as ApiError | null)?.message ||
      `Failed to update interview status (${res.status})`;
    throw new Error(msg);
  }

  return (body as ApiSuccess<ApplicationInterviewItem>).data;
}

// ---------------------------------------------------------------------------
// Dashboard metrics
// ---------------------------------------------------------------------------

export type DashboardMetrics = {
  totalApplications: number;
  countByStatus: Record<string, number>;
  recommendationBreakdown: Record<string, number>;
  averageAiScore: number | null;
  topCandidates: Array<{
    id: string;
    candidateFullName: string;
    jobTitle: string;
    aiScore: number | null;
    aiRecommendation: string | null;
    status: string;
  }>;
  recentActivity: Array<{
    title: string;
    description: string;
    createdAt: string;
    applicationId: string;
  }>;
};

export async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  const res = await fetch(`${API_BASE_URL}/api/dashboard/metrics`, {
    cache: "no-store",
    headers: authHeaders(),
  });

  const body = (await parseJsonSafe(res)) as
    | ApiSuccess<DashboardMetrics>
    | ApiError
    | null;

  if (!res.ok || !body || (body as any).success !== true) {
    const msg =
      (body as ApiError | null)?.message ||
      `Failed to fetch dashboard metrics (${res.status})`;
    throw new Error(msg);
  }

  return (body as ApiSuccess<DashboardMetrics>).data;
}

// ---------------------------------------------------------------------------
// Recruiter copilot — hybrid chat (POST /api/openclaw/chat)
// ---------------------------------------------------------------------------

export type { CopilotChatHistoryItem, CopilotChatApiResponse } from "@/types/copilot-chat";

/**
 * Sends a message with prior turns for multi-turn hybrid copilot (ATS + reasoning).
 */
export async function sendCopilotChatMessage(
  message: string,
  history: CopilotChatHistoryItem[]
): Promise<CopilotChatApiResponse> {
  const res = await fetch(`${API_BASE_URL}/api/openclaw/chat`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      message: message.trim(),
      history: history.map(({ role, content, metadata }) => {
        const item: {
          role: CopilotChatHistoryItem["role"];
          content: string;
          metadata?: unknown;
        } = { role, content };
        if (metadata !== undefined) item.metadata = metadata;
        return item;
      }),
    }),
  });

  const body = (await parseJsonSafe(res)) as
    | ApiSuccess<{
        reply: string;
        metadata?: unknown;
        mode?: CopilotChatApiResponse["mode"];
      }>
    | ApiError
    | null;

  if (!res.ok || !body || (body as { success?: boolean }).success !== true) {
    const msg =
      (body as ApiError | null)?.message ||
      `Copilot request failed (${res.status})`;
    throw new Error(msg);
  }

  const data = (body as ApiSuccess<CopilotChatApiResponse>).data;
  return {
    reply: data.reply,
    ...(data.metadata !== undefined && { metadata: data.metadata }),
    ...(data.mode !== undefined && { mode: data.mode }),
  };
}

