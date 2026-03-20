"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchJobScreeningQuestions,
  internalCreateApplication,
  searchJobsForAdmin,
} from "@/lib/adminApi";
import type { JobSearchItem } from "@/types/job";
import type {
  ScreeningAnswerDraft,
  ScreeningQuestion,
} from "@/types/screening";
import { ScreeningAnswerField } from "@/components/screening/ScreeningAnswerField";

export default function CreateApplicationPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/login");
  }, [authLoading, isAuthenticated, router]);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [resumeUrl, setResumeUrl] = useState("");

  const [jobQuery, setJobQuery] = useState("");
  const [jobResults, setJobResults] = useState<JobSearchItem[]>([]);
  const [jobId, setJobId] = useState<string>("");
  const [jobSearchLoading, setJobSearchLoading] = useState(false);

  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [screeningQuestions, setScreeningQuestions] = useState<
    ScreeningQuestion[]
  >([]);
  const [answersByQuestionId, setAnswersByQuestionId] = useState<
    Record<string, string>
  >({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const debounceTimer = useRef<number | null>(null);

  useEffect(() => {
    const q = jobQuery.trim();
    setError(null);
    setSuccess(null);

    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);

    if (q.length < 2) {
      setJobResults([]);
      return;
    }

    debounceTimer.current = window.setTimeout(async () => {
      try {
        setJobSearchLoading(true);
        const results = await searchJobsForAdmin(q, 10);
        setJobResults(results);
      } catch (err) {
        setJobResults([]);
        setError(
          err instanceof Error ? err.message : "Failed to search jobs."
        );
      } finally {
        setJobSearchLoading(false);
      }
    }, 350);

    return () => {
      if (debounceTimer.current)
        window.clearTimeout(debounceTimer.current);
    };
  }, [jobQuery]);

  useEffect(() => {
    const selectedJobId = jobId.trim();
    if (!selectedJobId) {
      setScreeningQuestions([]);
      setAnswersByQuestionId({});
      return;
    }

    let cancelled = false;
    const load = async () => {
      setQuestionsLoading(true);
      setError(null);
      try {
        const qs = await fetchJobScreeningQuestions(selectedJobId);
        if (cancelled) return;
        setScreeningQuestions(qs);
        setAnswersByQuestionId({});
      } catch (err) {
        if (cancelled) return;
        setScreeningQuestions([]);
        setAnswersByQuestionId({});
        setError(
          err instanceof Error
            ? err.message
            : "Failed to fetch screening questions."
        );
      } finally {
        if (!cancelled) setQuestionsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const hasQuestions = screeningQuestions.length > 0;

  const answersPayload: ScreeningAnswerDraft[] = useMemo(() => {
    return screeningQuestions.map((q) => ({
      screeningQuestionId: q.id,
      answer: answersByQuestionId[q.id] ?? "",
    }));
  }, [screeningQuestions, answersByQuestionId]);

  const canSubmit = useMemo(() => {
    if (!fullName.trim() || !email.trim() || !jobId.trim()) return false;
    if (!hasQuestions) return true;
    return answersPayload.every((a) => a.answer.trim().length > 0);
  }, [fullName, email, jobId, hasQuestions, answersPayload]);

  if (authLoading || !isAuthenticated) {
    return (
      <main className="mx-auto flex min-h-[40vh] max-w-3xl items-center justify-center px-4">
        <p className="text-stone-600">
          {authLoading ? "Loading…" : "Redirecting…"}
        </p>
      </main>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!canSubmit) {
      setError("Please complete the required fields and screening answers.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await internalCreateApplication({
        fullName,
        email,
        phone: phone || undefined,
        resumeUrl: resumeUrl || undefined,
        jobId,
        answers: hasQuestions ? answersPayload : undefined,
      });
      setSuccess(
        `Application created successfully (id: ${res.applicationId}).`
      );
      setFullName("");
      setEmail("");
      setPhone("");
      setResumeUrl("");
      setJobQuery("");
      setJobResults([]);
      setJobId("");
      setScreeningQuestions([]);
      setAnswersByQuestionId({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create application.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Create application
        </h1>
        <p className="mt-1 text-sm text-stone-600">
          Internal admin workflow. If the job has screening questions, you must answer them to trigger AI evaluation.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-stone-800">
                Candidate full name
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 focus:outline-none focus:ring-1 focus:ring-stone-400"
                placeholder="Candidate name"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-800">
                Email
              </label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 focus:outline-none focus:ring-1 focus:ring-stone-400"
                placeholder="candidate@email.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-800">
                Phone (optional)
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 focus:outline-none focus:ring-1 focus:ring-stone-400"
                placeholder="+977..."
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-stone-800">
                Resume URL (optional)
              </label>
              <input
                value={resumeUrl}
                onChange={(e) => setResumeUrl(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 focus:outline-none focus:ring-1 focus:ring-stone-400"
                placeholder="https://..."
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-stone-900">Job selection</h2>
          <p className="mt-1 text-xs text-stone-500">
            Search and select the job for this candidate.
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-stone-800">
                Search job title
              </label>
              <input
                value={jobQuery}
                onChange={(e) => setJobQuery(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 focus:outline-none focus:ring-1 focus:ring-stone-400"
                placeholder="e.g. Frontend Developer"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-800">
                Job
              </label>
              <select
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 focus:outline-none focus:ring-1 focus:ring-stone-400"
                disabled={jobSearchLoading || jobResults.length === 0}
              >
                <option value="">Select a job…</option>
                {jobResults.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.title}
                    {j.department ? ` (${j.department})` : ""}
                    {j.location ? ` - ${j.location}` : ""}
                  </option>
                ))}
              </select>

              {jobSearchLoading && (
                <p className="mt-1 text-xs text-stone-500">Searching…</p>
              )}
              {!jobSearchLoading && jobQuery.trim().length >= 2 && jobResults.length === 0 && (
                <p className="mt-1 text-xs text-stone-500">No matching jobs.</p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-stone-900">
            Screening answers
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            Answering these screening questions helps the system evaluate the candidate using AI and may improve the quality of selection decisions.
          </p>

          <div className="mt-4">
            {questionsLoading && (
              <p className="text-sm text-stone-600">Loading screening questions…</p>
            )}

            {!questionsLoading && jobId.trim() && screeningQuestions.length === 0 && (
              <p className="text-sm text-stone-600">
                This job has no screening questions. The application will be created normally.
              </p>
            )}

            {!questionsLoading && screeningQuestions.length > 0 && (
              <div className="space-y-4">
                {screeningQuestions.map((q) => (
                  <ScreeningAnswerField
                    key={q.id}
                    question={q}
                    value={answersByQuestionId[q.id] ?? ""}
                    onChange={(next) =>
                      setAnswersByQuestionId((prev) => ({
                        ...prev,
                        [q.id]: next,
                      }))
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {success}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={submitting || !canSubmit}
            className="rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create application"}
          </button>
        </div>
      </form>
    </main>
  );
}

