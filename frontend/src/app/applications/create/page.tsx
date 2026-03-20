"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchJobScreeningQuestions,
  fetchActiveJobsForAdmin,
  internalCreateApplication,
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
  const [jobId, setJobId] = useState<string>("");
  const [allJobs, setAllJobs] = useState<JobSearchItem[]>([]);
  const [allJobsLoading, setAllJobsLoading] = useState(false);
  const [jobDropdownOpen, setJobDropdownOpen] = useState(false);
  const jobPickerRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    const load = async () => {
      setAllJobsLoading(true);
      setError(null);
      try {
        const jobs = await fetchActiveJobsForAdmin(500);
        if (cancelled) return;
        setAllJobs(jobs);
      } catch (err) {
        if (cancelled) return;
        setAllJobs([]);
        setError(
          err instanceof Error ? err.message : "Failed to load active jobs."
        );
      } finally {
        if (!cancelled) setAllJobsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!jobDropdownOpen) return;

    const onMouseDown = (e: MouseEvent) => {
      const el = jobPickerRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) {
        setJobDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [jobDropdownOpen]);

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
  const filteredJobs = useMemo(() => {
    const q = jobQuery.trim().toLowerCase();
    if (!q) return allJobs;

    return allJobs.filter((j) => {
      const title = j.title.toLowerCase();
      const dept = (j.department ?? "").toLowerCase();
      const loc = (j.location ?? "").toLowerCase();
      const desc = (j.description ?? "").toLowerCase();
      return (
        title.includes(q) ||
        dept.includes(q) ||
        loc.includes(q) ||
        desc.includes(q)
      );
    });
  }, [jobQuery, allJobs]);

  const selectedJob = useMemo(() => {
    if (!jobId.trim()) return null;
    return allJobs.find((j) => j.id === jobId) ?? null;
  }, [jobId, allJobs]);

  const answersPayload: ScreeningAnswerDraft[] = useMemo(() => {
    return screeningQuestions.map((q) => ({
      screeningQuestionId: q.id,
      answer: answersByQuestionId[q.id] ?? "",
    }));
  }, [screeningQuestions, answersByQuestionId]);

  const canSubmit = useMemo(() => {
    if (questionsLoading) return false;
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
      setJobId("");
      setScreeningQuestions([]);
      setAnswersByQuestionId({});
      setJobDropdownOpen(false);
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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-stone-800">
                    Candidate full name
                  </label>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
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
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
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
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
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
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                    placeholder="https://..."
                  />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-stone-900">
                Job selection
              </h2>
              <p className="mt-1 text-xs text-stone-500">
                Pick a job to unlock screening questions.
              </p>

              <div className="mt-4 space-y-3" ref={jobPickerRef}>
                <div>
                  <label className="block text-sm font-medium text-stone-800">
                    Job (combobox)
                  </label>
                  <input
                    value={jobQuery}
                    onChange={(e) => {
                      setJobQuery(e.target.value);
                      setJobDropdownOpen(true);
                    }}
                    onFocus={() => setJobDropdownOpen(true)}
                    className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                    placeholder={allJobsLoading ? "Loading jobs…" : "Type to filter…"}
                    disabled={allJobsLoading}
                    aria-expanded={jobDropdownOpen}
                    aria-controls="job-combobox-list"
                    role="combobox"
                  />
                  <p className="mt-1 text-[11px] text-stone-500">
                    Showing {filteredJobs.length} active job(s).
                  </p>

                  {jobDropdownOpen && (
                    <div
                      id="job-combobox-list"
                      className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-stone-200 bg-white shadow-sm"
                    >
                      {allJobsLoading ? (
                        <div className="px-3 py-2 text-sm text-stone-600">
                          Loading jobs…
                        </div>
                      ) : filteredJobs.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-stone-600">
                          No jobs match your filter.
                        </div>
                      ) : (
                        <ul className="py-1">
                          {filteredJobs.map((j) => {
                            const active = j.id === jobId;
                            return (
                              <li key={j.id}>
                                <button
                                  type="button"
                                  className={`w-full px-3 py-2 text-left transition-colors ${
                                    active
                                      ? "bg-teal-50 text-teal-800"
                                      : "hover:bg-stone-50"
                                  }`}
                                  onClick={() => {
                                    setJobId(j.id);
                                    setJobQuery(j.title);
                                    setJobDropdownOpen(false);
                                  }}
                                >
                                  <div className="text-sm font-medium">
                                    {j.title}
                                  </div>
                                  {(j.department || j.location) && (
                                    <div className="mt-0.5 text-xs text-stone-500">
                                      {j.department ? j.department : ""}
                                      {j.department && j.location ? " • " : ""}
                                      {j.location ? j.location : ""}
                                    </div>
                                  )}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {selectedJob ? (
                  <div className="rounded-lg border border-stone-200 bg-white p-3">
                    <div className="text-sm font-semibold text-stone-900">
                      {selectedJob.title}
                    </div>
                    <div className="mt-1 text-xs text-stone-600">
                      {selectedJob.department ? selectedJob.department : "—"}
                      {" • "}
                      {selectedJob.location ? selectedJob.location : "N/A"}
                    </div>
                    {selectedJob.description ? (
                      <div className="mt-2 whitespace-pre-wrap text-sm text-stone-700">
                        {selectedJob.description}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-stone-500">
                        No description for this job.
                      </div>
                    )}

                    <button
                      type="button"
                      className="mt-3 text-xs font-medium text-teal-700 hover:text-teal-800"
                      onClick={() => {
                        setJobId("");
                        setJobQuery("");
                        setJobDropdownOpen(false);
                      }}
                    >
                      Clear job
                    </button>
                  </div>
                ) : null}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            {jobId.trim() ? (
              <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-stone-900">
                  Screening answers
                </h2>
                <p className="mt-1 text-xs text-stone-500">
                  Answering these screening questions helps trigger AI evaluation for this candidate.
                </p>

                <div className="mt-4">
                  {questionsLoading && (
                    <p className="text-sm text-stone-600">
                      Loading screening questions…
                    </p>
                  )}

                  {!questionsLoading && screeningQuestions.length === 0 && (
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
            ) : (
              <section className="rounded-xl border border-dashed border-stone-300 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-stone-900">
                  Screening questions
                </h2>
                <p className="mt-1 text-xs text-stone-500">
                  Select a job to see its screening questions here.
                </p>
              </section>
            )}
          </div>
        </div>

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

