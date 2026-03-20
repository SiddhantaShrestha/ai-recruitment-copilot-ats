import { useRef, useEffect } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { ApplicationListItem, ApplicationStatus } from "@/types/application";

type Action = {
  label: string;
  nextStatus: ApplicationStatus;
  tone?: "primary" | "danger";
};

function getActions(status: ApplicationStatus): Action[] {
  switch (status) {
    case "APPLIED":
      return [{ label: "Move to Screened", nextStatus: "SCREENED", tone: "primary" }];
    case "SCREENED":
      return [
        { label: "Shortlist", nextStatus: "SHORTLISTED", tone: "primary" },
        { label: "Reject", nextStatus: "REJECTED", tone: "danger" },
      ];
    case "SHORTLISTED":
      return [
        { label: "Move to Interview", nextStatus: "INTERVIEW", tone: "primary" },
        { label: "Reject", nextStatus: "REJECTED", tone: "danger" },
      ];
    case "INTERVIEW":
      return [
        { label: "Offer", nextStatus: "OFFER", tone: "primary" },
        { label: "Reject", nextStatus: "REJECTED", tone: "danger" },
      ];
    case "OFFER":
      return [
        { label: "Hire", nextStatus: "HIRED", tone: "primary" },
        { label: "Reject", nextStatus: "REJECTED", tone: "danger" },
      ];
    case "HIRED":
    case "REJECTED":
      return [];
  }
}

function actionButtonClass(tone: Action["tone"]) {
  if (tone === "danger") {
    return "bg-rose-600 hover:bg-rose-700 focus-visible:outline-rose-600";
  }
  return "bg-teal-700 hover:bg-teal-800 focus-visible:outline-teal-600";
}

export function ApplicationsTable({
  applications,
  onMove,
  movingId,
  onViewDetails,
  selectedIds = [],
  onSelectionChange,
}: {
  applications: ApplicationListItem[];
  onMove: (id: string, status: ApplicationStatus) => void;
  movingId: string | null;
  onViewDetails: (id: string) => void;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}) {
  const selectedSet = new Set(selectedIds);
  const allIds = applications.map((a) => a.id);
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedSet.has(id));
  const someSelected = allIds.some((id) => selectedSet.has(id));
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = headerCheckboxRef.current;
    if (el) el.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  const handleHeaderCheckbox = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange([...allIds]);
    }
  };

  const handleRowCheckbox = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onSelectionChange) return;
    if (selectedSet.has(id)) {
      onSelectionChange(selectedIds.filter((x) => x !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <table className="min-w-full divide-y divide-stone-200">
        <thead className="bg-stone-50">
          <tr>
            {onSelectionChange ? (
              <th className="w-10 px-2 py-3 text-left">
                <input
                  type="checkbox"
                  ref={headerCheckboxRef}
                  checked={allSelected}
                  onChange={handleHeaderCheckbox}
                  onClick={(e) => e.stopPropagation()}
                  className="h-4 w-4 rounded border-stone-300 text-teal-600 focus:ring-teal-600"
                  aria-label="Select all on page"
                />
              </th>
            ) : null}
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
              AI recommendation
            </th>
            <th className="px-4 py-3 text-left text-sm font-medium text-stone-700">
              Status
            </th>
            <th className="px-4 py-3 text-left text-sm font-medium text-stone-700">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {applications.map((app) => {
            const actions = getActions(app.status);
            const isMoving = movingId === app.id;
            const actionsDisabled = isMoving || actions.length === 0;

            return (
              <tr
                key={app.id}
                className={`cursor-pointer hover:bg-stone-50 transition-colors ${selectedSet.has(app.id) ? "bg-teal-50/50" : ""}`}
                onClick={() => onViewDetails(app.id)}
                role="button"
                tabIndex={0}
                aria-label={`View details for ${app.candidate.fullName}`}
              >
                {onSelectionChange ? (
                  <td className="w-10 px-2 py-3">
                    <input
                      type="checkbox"
                      checked={selectedSet.has(app.id)}
                      onChange={() => {}}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRowCheckbox(app.id, e);
                      }}
                      className="h-4 w-4 rounded border-stone-300 text-teal-600 focus:ring-teal-600"
                      aria-label={`Select ${app.candidate?.fullName ?? app.id}`}
                    />
                  </td>
                ) : null}
                <td className="px-4 py-3 text-sm font-medium text-stone-900">
                  {app.candidate?.fullName ?? "—"}
                </td>
                <td className="px-4 py-3 text-sm text-stone-700">
                  {app.job?.title ?? "—"}
                </td>
                <td className="px-4 py-3 text-sm text-stone-700">
                  {typeof app.aiScore === "number" ? app.aiScore : "—"}
                </td>
                <td className="px-4 py-3 text-sm text-stone-700">
                  {app.aiRecommendation ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={app.status} />
                </td>
                <td className="px-4 py-3">
                  {actionsDisabled ? (
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center rounded-lg bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-400"
                    >
                      {app.status === "HIRED" || app.status === "REJECTED"
                        ? "No actions"
                        : isMoving
                        ? "Updating…"
                        : "—"}
                    </button>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {actions.map((a) => (
                        <button
                          key={a.label}
                          type="button"
                          disabled={isMoving}
                          onClick={(e) => {
                            e.stopPropagation();
                            onMove(app.id, a.nextStatus);
                          }}
                          className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:opacity-60 ${actionButtonClass(
                            a.tone
                          )}`}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}

          {applications.length === 0 ? (
            <tr>
              <td
                colSpan={onSelectionChange ? 7 : 6}
                className="px-4 py-10 text-center text-sm text-stone-600"
              >
                No applications found.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

