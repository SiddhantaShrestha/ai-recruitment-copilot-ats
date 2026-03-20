"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApplicationsTable } from "@/components/ApplicationsTable";
import { CandidateDetailsDrawer } from "@/components/CandidateDetailsDrawer";
import { PipelineFilters, type AiRecommendationFilter } from "@/components/PipelineFilters";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchApplications,
  moveApplicationStatus,
  bulkMoveApplications,
  type PaginationMeta,
} from "@/lib/api";
import type { ApplicationListItem, ApplicationStatus } from "@/types/application";

export default function CandidatesPage() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.replace("/login");
  }, [authLoading, isAuthenticated, router]);

  const [applications, setApplications] = useState<ApplicationListItem[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkMoving, setBulkMoving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Recruiter filters
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | ApplicationStatus>("");
  const [jobId, setJobId] = useState("");
  const [aiRecommendation, setAiRecommendation] = useState<
    "" | AiRecommendationFilter
  >("");
  const [minAiScore, setMinAiScore] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const load = useCallback(async (opts?: { showLoading?: boolean }) => {
    const showLoading = opts?.showLoading ?? true;
    setError(null);

    if (showLoading) setLoading(true);
    else setRefreshing(true);
    try {
      const result = await fetchApplications({
        search,
        status,
        jobId,
        recommendation: aiRecommendation,
        scoreMin: minAiScore,
        page,
        limit,
      });
      setApplications(result.data);
      setMeta(result.meta);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load applications";
      setError(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, status, jobId, aiRecommendation, minAiScore, page, limit]);

  useEffect(() => {
    if (isAuthenticated) void load({ showLoading: true });
  }, [load, isAuthenticated]);

  const jobOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of applications) {
      if (a.jobId) map.set(a.jobId, a.job.title);
    }
    return Array.from(map.entries())
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [applications]);

  const onMove = useCallback(
    async (id: string, status: ApplicationStatus) => {
      setMovingId(id);
      setError(null);
      try {
        await moveApplicationStatus(id, status);
        await load({ showLoading: false });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to update status";
        setError(msg);
      } finally {
        setMovingId(null);
      }
    },
    [load]
  );

  const selectedApplication = useMemo(() => {
    if (!selectedId) return null;
    return applications.find((a) => a.id === selectedId) ?? null;
  }, [applications, selectedId]);

  const onViewDetails = useCallback((id: string) => {
    setSelectedId(id);
    setDetailsOpen(true);

    // Requirements: show loading state for selected candidate details.
    setDetailsLoading(true);
    window.setTimeout(() => setDetailsLoading(false), 250);
  }, []);

  // If the selected candidate isn't in the loaded page anymore, close drawer.
  useEffect(() => {
    if (!selectedId) return;
    if (!applications.some((a) => a.id === selectedId)) {
      setDetailsOpen(false);
      setSelectedId(null);
    }
  }, [applications, selectedId]);

  // Reset to first page whenever filters change.
  useEffect(() => {
    setPage(1);
  }, [search, status, jobId, aiRecommendation, minAiScore, limit]);

  // Clear selection when filters or page change so selection stays in sync with visible data.
  useEffect(() => {
    setSelectedIds([]);
  }, [search, status, jobId, aiRecommendation, minAiScore, page, limit]);

  const clearFilters = useCallback(() => {
    setSearch("");
    setStatus("");
    setJobId("");
    setAiRecommendation("");
    setMinAiScore("");
    setPage(1);
  }, []);

  const handleBulkMove = useCallback(
    async (status: ApplicationStatus) => {
      if (selectedIds.length === 0) return;
      setError(null);
      setSuccessMessage(null);
      setBulkMoving(true);
      try {
        const result = await bulkMoveApplications(selectedIds, status);
        setSelectedIds([]);
        await load({ showLoading: false });
        if (result.skippedCount > 0) {
          setSuccessMessage(
            `Updated ${result.updatedCount} application(s). ${result.skippedCount} skipped.`
          );
        } else {
          setSuccessMessage(`Updated ${result.updatedCount} application(s).`);
        }
        window.setTimeout(() => setSuccessMessage(null), 4000);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Bulk update failed";
        setError(msg);
      } finally {
        setBulkMoving(false);
      }
    },
    [selectedIds, load]
  );

  if (authLoading || !isAuthenticated) {
    return (
      <main className="flex min-h-[40vh] items-center justify-center">
        <p className="text-stone-600">{authLoading ? "Loading…" : "Redirecting…"}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-stone-900">
          Pipeline
        </h1>
        <p className="text-sm text-stone-600">
          Review applications and move candidates through the hiring pipeline.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      {successMessage ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-lg border border-stone-200 bg-white p-6 text-sm text-stone-600">
          Loading applications…
        </div>
      ) : (
        <>
          <PipelineFilters
            search={search}
            onSearchChange={setSearch}
            status={status}
            onStatusChange={setStatus}
            jobId={jobId}
            onJobIdChange={setJobId}
            aiRecommendation={aiRecommendation}
            onAiRecommendationChange={setAiRecommendation}
            minAiScore={minAiScore}
            onMinAiScoreChange={setMinAiScore}
            onClear={clearFilters}
            jobOptions={jobOptions}
          />

          {selectedIds.length > 0 ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3">
              <span className="text-sm font-medium text-stone-700">
                {selectedIds.length} selected
              </span>
              <button
                type="button"
                disabled={bulkMoving}
                onClick={() => handleBulkMove("SHORTLISTED")}
                className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50 transition-colors"
              >
                {bulkMoving ? "Updating…" : "Shortlist"}
              </button>
              <button
                type="button"
                disabled={bulkMoving}
                onClick={() => handleBulkMove("REJECTED")}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                Reject
              </button>
              <button
                type="button"
                disabled={bulkMoving}
                onClick={() => handleBulkMove("INTERVIEW")}
                className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50 transition-colors"
              >
                Move to interview
              </button>
              <button
                type="button"
                disabled={bulkMoving}
                onClick={() => setSelectedIds([])}
                className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-50 transition-colors"
              >
                Clear
              </button>
            </div>
          ) : null}

          <ApplicationsTable
            applications={applications}
            onMove={onMove}
            movingId={movingId}
            onViewDetails={onViewDetails}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
          />

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-stone-500">
            <span>
              Showing {applications.length} of {meta.total} applications
            </span>
            <div className="flex items-center gap-2">
              <label className="text-xs text-stone-500">Page size</label>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-xs text-stone-700 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50 transition-colors"
              >
                Previous
              </button>
              <span className="text-xs text-stone-600">
                Page {meta.page} of {meta.totalPages}
              </span>
              <button
                type="button"
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50 transition-colors"
              >
                Next
              </button>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 font-medium text-stone-600 hover:bg-stone-50 transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>

          {refreshing ? (
            <div className="mt-2 text-xs text-stone-500">Refreshing…</div>
          ) : null}
        </>
      )}

      <CandidateDetailsDrawer
        open={detailsOpen}
        application={selectedApplication}
        loading={detailsLoading}
        movingId={movingId}
        onClose={() => setDetailsOpen(false)}
        onMove={(id, status) => void onMove(id, status)}
      />
    </main>
  );
}

