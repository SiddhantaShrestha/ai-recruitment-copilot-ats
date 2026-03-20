import type { JobSearchItem } from "@/types/job";
import type {
  ScreeningAnswerDraft,
  ScreeningQuestion,
  ScreeningQuestionType,
  ScreeningQuestionDraft,
} from "@/types/screening";
import { getStoredToken } from "@/lib/api";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:5000";

type ApiSuccess<T> = { success: true; data: T; message?: string };
type ApiError = { success: false; message?: string };

function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json", ...authHeaders() };
}

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function searchJobsForAdmin(
  q: string,
  limit = 8
): Promise<JobSearchItem[]> {
  const qs = new URLSearchParams();
  qs.set("q", q.trim());
  qs.set("limit", String(limit));

  const res = await fetch(`${API_BASE_URL}/api/jobs/search?${qs.toString()}`, {
    headers: authHeaders(),
    cache: "no-store",
  });

  const body = (await parseJsonSafe(res)) as ApiSuccess<JobSearchItem[]> | ApiError | null;
  if (!res.ok || !body || body.success !== true) {
    throw new Error((body as ApiError | null)?.message || `Job search failed (${res.status})`);
  }

  return (body as ApiSuccess<JobSearchItem[]>).data;
}

export async function fetchJobScreeningQuestions(
  jobId: string
): Promise<ScreeningQuestion[]> {
  const res = await fetch(
    `${API_BASE_URL}/api/jobs/${jobId}/screening-questions`,
    {
      headers: authHeaders(),
      cache: "no-store",
    }
  );

  const body = (await parseJsonSafe(res)) as
    | ApiSuccess<ScreeningQuestion[]>
    | ApiError
    | null;

  if (!res.ok || !body || body.success !== true) {
    throw new Error(
      (body as ApiError | null)?.message ||
        `Failed to fetch screening questions (${res.status})`
    );
  }

  return (body as ApiSuccess<ScreeningQuestion[]>).data;
}

export async function createJobWithQuestions(payload: {
  title: string;
  department?: string;
  location?: string;
  description?: string;
  isActive?: boolean;
  questions?: ScreeningQuestionDraft[];
}): Promise<JobSearchItem> {
  const res = await fetch(`${API_BASE_URL}/api/jobs`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      title: payload.title.trim(),
      department: payload.department?.trim() || undefined,
      location: payload.location?.trim() || undefined,
      description: payload.description?.trim() || undefined,
      isActive: payload.isActive ?? true,
      screeningQuestions: payload.questions?.map((q) => ({
        question: q.question,
        order: q.order,
        type: q.type,
      })),
    }),
  });

  const body = (await parseJsonSafe(res)) as
    | ApiSuccess<JobSearchItem>
    | ApiError
    | null;

  if (!res.ok || !body || body.success !== true) {
    throw new Error(
      (body as ApiError | null)?.message ||
        `Job create failed (${res.status})`
    );
  }

  return (body as ApiSuccess<JobSearchItem>).data;
}

export async function internalCreateApplication(payload: {
  fullName: string;
  email: string;
  phone?: string;
  resumeUrl?: string;
  jobId: string;
  answers?: ScreeningAnswerDraft[];
}): Promise<{ applicationId: string; status?: string; aiRecommendation?: string | null }> {
  const res = await fetch(`${API_BASE_URL}/api/applications/internal-create`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      fullName: payload.fullName.trim(),
      email: payload.email.trim(),
      phone: payload.phone?.trim() || undefined,
      resumeUrl: payload.resumeUrl?.trim() || undefined,
      jobId: payload.jobId,
      answers: payload.answers?.map((a) => ({
        screeningQuestionId: a.screeningQuestionId,
        answer: a.answer,
      })),
    }),
  });

  const body = (await parseJsonSafe(res)) as
    | (ApiSuccess<{ id: string; status: string; aiRecommendation?: string | null }> & {
        data: any;
      })
    | ApiError
    | null;

  if (!res.ok || !body || (body as any).success !== true) {
    throw new Error(
      (body as ApiError | null)?.message ||
        `Application create failed (${res.status})`
    );
  }

  const data = (body as ApiSuccess<any>).data;
  return {
    applicationId: data.id,
    status: data.status,
    aiRecommendation: data.aiRecommendation ?? null,
  };
}

