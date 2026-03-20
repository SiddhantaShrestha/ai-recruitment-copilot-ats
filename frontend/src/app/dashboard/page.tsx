"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchDashboardMetrics,
  type DashboardMetrics,
} from "@/lib/api";

const STATUS_ORDER = [
  "APPLIED",
  "SCREENED",
  "SHORTLISTED",
  "INTERVIEW",
  "OFFER",
  "HIRED",
  "REJECTED",
] as const;

function formatDateTime(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function DashboardPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/login");
  }, [authLoading, isAuthenticated, router]);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await fetchDashboardMetrics();
      setMetrics(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) void load();
  }, [load, isAuthenticated]);

  if (authLoading || !isAuthenticated) {
    return (
      <main className="flex min-h-[40vh] items-center justify-center">
        <p className="text-stone-600">{authLoading ? "Loading…" : "Redirecting…"}</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-stone-900">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Pipeline health and hiring progress
          </p>
        </div>
        <div className="flex items-center gap-2 text-stone-500">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-teal-600" />
          Loading dashboard…
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-stone-900">
            Dashboard
          </h1>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 transition-colors"
        >
          Retry
        </button>
      </main>
    );
  }

  if (!metrics) return null;

  const { countByStatus } = metrics;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-stone-600">
            Pipeline health and hiring progress
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/candidates"
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
          >
            View pipeline
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Top stat cards */}
      <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="text-sm font-medium text-stone-500">
            Total applications
          </div>
          <div className="mt-1 text-2xl font-bold text-stone-900">
            {metrics.totalApplications}
          </div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="text-sm font-medium text-stone-500">
            Shortlisted
          </div>
          <div className="mt-1 text-2xl font-bold text-stone-900">
            {countByStatus.SHORTLISTED ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="text-sm font-medium text-stone-500">
            Interview
          </div>
          <div className="mt-1 text-2xl font-bold text-stone-900">
            {countByStatus.INTERVIEW ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="text-sm font-medium text-stone-500">
            Hired
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">
            {countByStatus.HIRED ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="text-sm font-medium text-stone-500">
            Rejected
          </div>
          <div className="mt-1 text-2xl font-bold text-stone-700">
            {countByStatus.REJECTED ?? 0}
          </div>
        </div>
      </section>

      {/* Pipeline breakdown */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-stone-800">
          Pipeline breakdown
        </h2>
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {STATUS_ORDER.map((status) => (
              <div
                key={status}
                className="rounded-lg border border-stone-100 bg-stone-50/80 px-3 py-2 text-center"
              >
                <div className="text-lg font-bold text-stone-900">
                  {countByStatus[status] ?? 0}
                </div>
                <div className="text-xs font-medium text-stone-600">
                  {status}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Insights */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-stone-800">
          AI insights
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="text-sm font-medium text-stone-500">
              Average AI score
            </div>
            <div className="mt-1 text-2xl font-bold text-stone-900">
              {metrics.averageAiScore != null
                ? metrics.averageAiScore.toFixed(1)
                : "—"}
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Across applications with an AI evaluation
            </p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="text-sm font-medium text-stone-500">
              Recommendation breakdown
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <div className="rounded-md bg-emerald-50 px-3 py-1.5">
                <span className="text-sm font-medium text-emerald-800">
                  Shortlist {metrics.recommendationBreakdown.SHORTLIST ?? 0}
                </span>
              </div>
              <div className="rounded-md bg-amber-50 px-3 py-1.5">
                <span className="text-sm font-medium text-amber-800">
                  Maybe {metrics.recommendationBreakdown.MAYBE ?? 0}
                </span>
              </div>
              <div className="rounded-md bg-rose-50 px-3 py-1.5">
                <span className="text-sm font-medium text-rose-800">
                  Reject {metrics.recommendationBreakdown.REJECT ?? 0}
                </span>
              </div>
              <div className="rounded-md bg-stone-100 px-3 py-1.5">
                <span className="text-sm font-medium text-stone-600">
                  Unknown {metrics.recommendationBreakdown.unknown ?? 0}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Top candidates */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-stone-800">
          Top candidates (by AI score)
        </h2>
        <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
          {metrics.topCandidates.length === 0 ? (
            <div className="p-6 text-center text-sm text-stone-500">
              No candidates with AI scores yet.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-stone-200">
              <thead className="bg-stone-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-stone-700">
                    Candidate
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-stone-700">
                    Job
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-stone-700">
                    AI score
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-stone-700">
                    Recommendation
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-stone-700">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {metrics.topCandidates.map((c) => (
                  <tr key={c.id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-stone-900">
                      <Link
                        href="/candidates"
                        className="hover:text-teal-700 hover:underline"
                      >
                        {c.candidateFullName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-700">
                      {c.jobTitle}
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-700">
                      {c.aiScore != null ? c.aiScore : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-700">
                      {c.aiRecommendation ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md px-2 py-0.5 text-xs font-medium bg-stone-100 text-stone-700">
                        {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Recent activity */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-stone-800">
          Recent activity
        </h2>
        <div className="rounded-lg border border-stone-200 bg-white">
          {metrics.recentActivity.length === 0 ? (
            <div className="p-6 text-center text-sm text-stone-500">
              No recent activity.
            </div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {metrics.recentActivity.map((a, idx) => (
                <li key={`${a.applicationId}-${a.createdAt}-${idx}`} className="px-4 py-3">
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-medium text-stone-900">
                        {a.title}
                      </div>
                      <div className="text-sm text-stone-600">
                        {a.description}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-stone-500 sm:mt-0">
                      {formatDateTime(a.createdAt)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
