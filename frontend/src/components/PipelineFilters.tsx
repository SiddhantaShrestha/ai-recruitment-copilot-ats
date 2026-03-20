import type { ApplicationStatus } from "@/types/application";

export type AiRecommendationFilter = "SHORTLIST" | "MAYBE" | "REJECT";

export function PipelineFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  jobId,
  onJobIdChange,
  aiRecommendation,
  onAiRecommendationChange,
  minAiScore,
  onMinAiScoreChange,
  onClear,
  jobOptions,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  status: "" | ApplicationStatus;
  onStatusChange: (value: "" | ApplicationStatus) => void;
  jobId: string;
  onJobIdChange: (value: string) => void;
  aiRecommendation: "" | AiRecommendationFilter;
  onAiRecommendationChange: (value: "" | AiRecommendationFilter) => void;
  minAiScore: string;
  onMinAiScoreChange: (value: string) => void;
  onClear: () => void;
  jobOptions: Array<{ id: string; title: string }>;
}) {
  return (
    <div className="mb-4 rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex w-full flex-col gap-2 md:flex-1">
          <label className="text-sm font-medium text-stone-700">
            Search by name
          </label>
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name…"
            className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm placeholder:text-stone-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
          />
        </div>

        <div className="grid w-full grid-cols-1 gap-3 md:w-auto md:grid-cols-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-stone-700">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => onStatusChange(e.target.value as any)}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
            >
              <option value="">Any</option>
              <option value="APPLIED">APPLIED</option>
              <option value="SCREENED">SCREENED</option>
              <option value="SHORTLISTED">SHORTLISTED</option>
              <option value="INTERVIEW">INTERVIEW</option>
              <option value="OFFER">OFFER</option>
              <option value="HIRED">HIRED</option>
              <option value="REJECTED">REJECTED</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-stone-700">
              Job
            </label>
            <select
              value={jobId}
              onChange={(e) => onJobIdChange(e.target.value)}
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
            >
              <option value="">Any</option>
              {jobOptions.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-stone-700">
              AI recommendation
            </label>
            <select
              value={aiRecommendation}
              onChange={(e) =>
                onAiRecommendationChange(e.target.value as any)
              }
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
            >
              <option value="">Any</option>
              <option value="SHORTLIST">SHORTLIST</option>
              <option value="MAYBE">MAYBE</option>
              <option value="REJECT">REJECT</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-stone-700">
              Min AI score
            </label>
            <input
              value={minAiScore}
              onChange={(e) => onMinAiScoreChange(e.target.value)}
              type="number"
              inputMode="decimal"
              placeholder="e.g. 60"
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm placeholder:text-stone-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
            />
          </div>
        </div>

        <div className="flex w-full items-end justify-end md:w-auto">
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Clear filters
          </button>
        </div>
      </div>
    </div>
  );
}

