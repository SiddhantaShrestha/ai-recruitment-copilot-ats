import type { ApplicationStatus } from "@/types/application";

const STATUS_STYLES: Record<ApplicationStatus, string> = {
  APPLIED: "bg-stone-100 text-stone-700",
  SCREENED: "bg-sky-50 text-sky-700",
  SHORTLISTED: "bg-teal-50 text-teal-700",
  INTERVIEW: "bg-amber-50 text-amber-700",
  OFFER: "bg-indigo-50 text-indigo-700",
  HIRED: "bg-emerald-50 text-emerald-700",
  REJECTED: "bg-rose-50 text-rose-700",
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

