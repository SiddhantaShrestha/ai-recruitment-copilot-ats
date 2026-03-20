"use client";

import { useMemo, useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  createJobWithQuestions,
} from "@/lib/adminApi";
import type {
  ScreeningQuestionDraft,
  ScreeningQuestionType,
} from "@/types/screening";

function QuestionTypeSelect({
  value,
  onChange,
}: {
  value: ScreeningQuestionType;
  onChange: (next: ScreeningQuestionType) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ScreeningQuestionType)}
      className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 focus:outline-none focus:ring-1 focus:ring-stone-400"
    >
      <option value="TEXT">TEXT</option>
      <option value="YES_NO">YES_NO</option>
      <option value="NUMBER">NUMBER</option>
    </select>
  );
}

export default function CreateJobPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/login");
  }, [authLoading, isAuthenticated, router]);

  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [questions, setQuestions] = useState<ScreeningQuestionDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const hasQuestions = questions.length > 0;

  const canSubmit = useMemo(() => {
    if (!title.trim()) return false;
    if (!hasQuestions) return true;
    // If questions exist, require non-empty question text for all rows.
    return questions.every((q) => q.question.trim().length > 0);
  }, [title, hasQuestions, questions]);

  if (authLoading || !isAuthenticated) {
    return (
      <main className="mx-auto flex min-h-[40vh] max-w-3xl items-center justify-center px-4">
        <p className="text-stone-600">
          {authLoading ? "Loading…" : "Redirecting…"}
        </p>
      </main>
    );
  }

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      { question: "", order: prev.length + 1, type: "TEXT" },
    ]);
  };

  const removeQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx).map((q, i) => ({ ...q, order: i + 1 })));
  };

  const updateQuestion = (idx: number, patch: Partial<ScreeningQuestionDraft>) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, ...patch } : q))
    );
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!title.trim()) {
      setError("Job title is required.");
      return;
    }

    if (hasQuestions && !questions.every((q) => q.question.trim().length > 0)) {
      setError("Please fill in all screening questions (question text).");
      return;
    }

    setSubmitting(true);
    try {
      await createJobWithQuestions({
        title,
        department: department || undefined,
        location: location || undefined,
        description: description || undefined,
        isActive,
        questions: hasQuestions ? questions : undefined,
      });
      setSuccess("Job created successfully.");
      setTitle("");
      setDepartment("");
      setLocation("");
      setDescription("");
      setIsActive(true);
      setQuestions([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create job.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Create job
        </h1>
        <p className="mt-1 text-sm text-stone-600">
          Internal admin workflow. Optionally add screening questions for AI evaluation.
        </p>
      </header>

      <form onSubmit={onSubmit} className="space-y-6">
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-stone-800">
                Job title
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 focus:outline-none focus:ring-1 focus:ring-stone-400"
                placeholder="e.g. Frontend Developer"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-800">
                Department
              </label>
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 focus:outline-none focus:ring-1 focus:ring-stone-400"
                placeholder="e.g. Engineering"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-800">
                Location
              </label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 focus:outline-none focus:ring-1 focus:ring-stone-400"
                placeholder="e.g. Kathmandu / Remote"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-stone-800">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 w-full min-h-[96px] resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 focus:outline-none focus:ring-1 focus:ring-stone-400"
                placeholder="Role summary, requirements, etc."
              />
            </div>

            <div className="sm:col-span-2 flex items-center gap-3">
              <input
                id="isActive"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="isActive" className="text-sm text-stone-700">
                Active (recruiters can create applications for this job)
              </label>
            </div>
          </div>
        </section>

        <details open={hasQuestions} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer select-none text-sm font-semibold text-stone-900">
            Screening questions (optional)
          </summary>

          <div className="mt-4 space-y-4">
            {questions.length === 0 && (
              <p className="text-sm text-stone-600">
                Add screening questions to enable AI evaluation during application creation.
              </p>
            )}

            {questions.map((q, idx) => (
              <div
                key={`${idx}-${q.order}`}
                className="rounded-lg border border-stone-200 bg-stone-50 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-sm font-semibold text-stone-900">
                    Question {idx + 1}
                  </h2>
                  <button
                    type="button"
                    onClick={() => removeQuestion(idx)}
                    disabled={submitting}
                    className="rounded-md border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-stone-800">
                      Question
                    </label>
                    <textarea
                      value={q.question}
                      onChange={(e) =>
                        updateQuestion(idx, { question: e.target.value })
                      }
                      className="mt-1 w-full min-h-[72px] resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 focus:outline-none focus:ring-1 focus:ring-stone-400"
                      placeholder="Type the screening question..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-stone-800">
                      Order
                    </label>
                    <input
                      type="number"
                      value={q.order}
                      min={1}
                      step={1}
                      onChange={(e) =>
                        updateQuestion(idx, {
                          order: Number(e.target.value || 1),
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600 focus:outline-none focus:ring-1 focus:ring-stone-400"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-sm font-medium text-stone-800">
                      Question type
                    </label>
                    <div className="mt-1">
                      <QuestionTypeSelect
                        value={q.type}
                        onChange={(next) => updateQuestion(idx, { type: next })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={addQuestion}
                disabled={submitting}
                className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                Add question
              </button>
              <p className="text-xs text-stone-500">
                Answers will be captured during internal application creation.
              </p>
            </div>
          </div>
        </details>

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
            {submitting ? "Creating…" : "Create job"}
          </button>
        </div>
      </form>
    </main>
  );
}

