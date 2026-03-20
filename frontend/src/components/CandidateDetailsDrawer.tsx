"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ApplicationListItem,
  ApplicationStatus,
} from "@/types/application";
import { StatusBadge } from "@/components/StatusBadge";
import {
  fetchApplicationActivity,
  createApplicationNote,
  fetchApplicationNotes,
  fetchApplicationInterviews,
  createApplicationInterview,
  updateInterviewStatus,
  type ApplicationActivityItem,
  type ApplicationNoteItem,
  type ApplicationInterviewItem,
  type CreateInterviewPayload,
  type InterviewMode,
  type InterviewStatus,
} from "@/lib/api";

type Action = {
  label: string;
  nextStatus: ApplicationStatus;
  tone?: "primary" | "danger";
};

function getDetailActions(status: ApplicationStatus): Action[] {
  switch (status) {
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
    default:
      // APPLIED/HIRED/REJECTED: no actions per requirements.
      return [];
  }
}

function actionClass(tone: Action["tone"]) {
  if (tone === "danger") {
    return "bg-rose-600 hover:bg-rose-700 focus-visible:outline-rose-600";
  }
  return "bg-teal-700 hover:bg-teal-800 focus-visible:outline-teal-600";
}

export function CandidateDetailsDrawer({
  open,
  application,
  loading,
  movingId,
  onClose,
  onMove,
}: {
  open: boolean;
  application: ApplicationListItem | null;
  loading: boolean;
  movingId: string | null;
  onClose: () => void;
  onMove: (id: string, status: ApplicationStatus) => void;
}) {
  const [activities, setActivities] = useState<ApplicationActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [notes, setNotes] = useState<ApplicationNoteItem[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteContent, setNoteContent] = useState("");
  const [noteSubmitting, setNoteSubmitting] = useState(false);

  const [interviews, setInterviews] = useState<ApplicationInterviewItem[]>([]);
  const [interviewsLoading, setInterviewsLoading] = useState(false);
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const [interviewForm, setInterviewForm] = useState<{
    scheduledAt: string;
    mode: InterviewMode;
    meetingLink: string;
    location: string;
    notes: string;
  }>({
    scheduledAt: "",
    mode: "ONLINE",
    meetingLink: "",
    location: "",
    notes: "",
  });

  const formatDateTime = (value?: string | null) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  };

  const answersSorted = useMemo(() => {
    if (!application?.answers) return [];
    return [...application.answers].sort(
      (a, b) => a.screeningQuestion.order - b.screeningQuestion.order
    );
  }, [application]);

  const actions = useMemo(() => {
    if (!application) return [];
    return getDetailActions(application.status);
  }, [application]);

  // Fetch activity when drawer opens with an application (backend-driven timeline).
  const loadActivity = useCallback(async (applicationId: string) => {
    setActivityLoading(true);
    try {
      const data = await fetchApplicationActivity(applicationId);
      setActivities(data);
    } catch {
      setActivities([]);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  const loadNotes = useCallback(async (applicationId: string) => {
    setNotesLoading(true);
    try {
      const data = await fetchApplicationNotes(applicationId);
      setNotes(data);
    } catch {
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }, []);

  const loadInterviews = useCallback(async (applicationId: string) => {
    setInterviewsLoading(true);
    try {
      const data = await fetchApplicationInterviews(applicationId);
      setInterviews(data);
    } catch {
      setInterviews([]);
    } finally {
      setInterviewsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && application?.id) {
      void loadActivity(application.id);
      void loadNotes(application.id);
      if (application.status === "INTERVIEW") void loadInterviews(application.id);
    } else {
      setActivities([]);
      setNotes([]);
      setInterviews([]);
    }
  }, [open, application?.id, application?.status, loadActivity, loadNotes, loadInterviews]);

  useEffect(() => {
    if (!application?.id) {
      setNoteContent("");
      setInterviewForm({
        scheduledAt: "",
        mode: "ONLINE",
        meetingLink: "",
        location: "",
        notes: "",
      });
    }
  }, [application?.id]);

  const handleAddNote = useCallback(async () => {
    if (!application?.id || !noteContent.trim()) return;
    setNoteSubmitting(true);
    try {
      await createApplicationNote(application.id, noteContent.trim());
      setNoteContent("");
      await loadNotes(application.id);
      await loadActivity(application.id);
    } catch {
      // Optionally show error toast
    } finally {
      setNoteSubmitting(false);
    }
  }, [application?.id, noteContent, loadNotes, loadActivity]);

  const handleScheduleInterview = useCallback(async () => {
    if (!application?.id || !interviewForm.scheduledAt.trim()) return;
    setScheduleSubmitting(true);
    try {
      const payload: CreateInterviewPayload = {
        scheduledAt: new Date(interviewForm.scheduledAt).toISOString(),
        mode: interviewForm.mode,
        meetingLink: interviewForm.meetingLink.trim() || undefined,
        location: interviewForm.location.trim() || undefined,
        notes: interviewForm.notes.trim() || undefined,
      };
      await createApplicationInterview(application.id, payload);
      setInterviewForm((prev) => ({
        ...prev,
        scheduledAt: "",
        meetingLink: "",
        location: "",
        notes: "",
      }));
      await loadInterviews(application.id);
      await loadActivity(application.id);
    } catch {
      // Optionally show error
    } finally {
      setScheduleSubmitting(false);
    }
  }, [application?.id, interviewForm, loadInterviews, loadActivity]);

  const handleInterviewStatus = useCallback(
    async (interviewId: string, status: InterviewStatus) => {
      if (!application?.id) return;
      setStatusUpdatingId(interviewId);
      try {
        await updateInterviewStatus(interviewId, status);
        await loadInterviews(application.id);
        await loadActivity(application.id);
      } catch {
        // Optionally show error
      } finally {
        setStatusUpdatingId(null);
      }
    },
    [application?.id, loadInterviews, loadActivity]
  );

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-teal-700/30"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-stone-900">
              Candidate details
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              Review and move the application through the pipeline.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-6">
          {loading ? (
            <div className="space-y-4">
              <div className="h-5 w-2/3 animate-pulse rounded bg-stone-100" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-stone-100" />
              <div className="h-28 animate-pulse rounded bg-stone-100" />
              <div className="h-40 animate-pulse rounded bg-stone-100" />
            </div>
          ) : !application ? (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
              Candidate details not available.
            </div>
          ) : (
            <>
              {/* Header / summary */}
              <section className="rounded-lg border border-stone-200 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xl font-bold text-stone-900">
                      {application.candidate.fullName}
                    </div>
                    <div className="mt-1 text-sm text-stone-600">
                      {application.job.title}
                      {application.job.department
                        ? ` • ${application.job.department}`
                        : ""}
                      {application.job.location ? ` • ${application.job.location}` : ""}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <StatusBadge status={application.status} />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-sm font-medium text-stone-500">
                      Contact
                    </div>
                    <div className="mt-1 text-sm text-stone-800">
                      <div>Email: {application.candidate.email}</div>
                      <div>Phone: {application.candidate.phone ?? "N/A"}</div>
                      <div className="mt-2">
                        {application.candidate.resumeUrl ? (
                          <a
                            href={application.candidate.resumeUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium text-teal-700 underline hover:text-teal-800"
                          >
                            View Resume
                          </a>
                        ) : (
                          <span className="text-stone-500">Resume: N/A</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-medium text-stone-500">
                      AI evaluation
                    </div>
                    <div className="mt-1 text-sm text-stone-800">
                      <div>
                        AI Score:{" "}
                        {typeof application.aiScore === "number"
                          ? application.aiScore
                          : "—"}
                      </div>
                      <div>
                        AI Recommendation: {application.aiRecommendation ?? "—"}
                      </div>
                      <div className="mt-2">
                        <div className="text-sm font-medium text-stone-500">
                          Summary
                        </div>
                        <div className="mt-1 whitespace-pre-wrap text-sm text-stone-700">
                          {application.aiSummary ?? "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Screening Q/A */}
              <section className="rounded-lg border border-stone-200 bg-white p-4">
                <div className="text-sm font-semibold text-stone-900">
                  Screening questions & answers
                </div>
                <div className="mt-3 space-y-3">
                  {answersSorted.length === 0 ? (
                    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-700">
                      No screening answers found for this application.
                    </div>
                  ) : (
                    answersSorted.map((a) => (
                      <div
                        key={a.id}
                        className="rounded-lg border border-stone-200 bg-stone-50/50 p-3"
                      >
                        <div className="text-sm font-medium text-stone-900">
                          {a.screeningQuestion.question}
                        </div>
                        <div className="mt-1 whitespace-pre-wrap text-sm text-stone-700">
                          {a.answer}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* Interview (only when status is INTERVIEW) */}
              {application.status === "INTERVIEW" && (
                <section className="rounded-lg border border-stone-200 bg-white p-4">
                  <div className="text-sm font-semibold text-stone-900">
                    Interview
                  </div>
                  <div className="mt-3 space-y-4">
                    <div className="flex flex-col gap-3 rounded-lg border border-stone-200 bg-stone-50/50 p-3">
                      <label className="text-sm font-medium text-stone-600">
                        Date & time
                      </label>
                      <input
                        type="datetime-local"
                        value={interviewForm.scheduledAt}
                        onChange={(e) =>
                          setInterviewForm((prev) => ({
                            ...prev,
                            scheduledAt: e.target.value,
                          }))
                        }
                        className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                      />
                      <label className="text-sm font-medium text-stone-600">
                        Mode
                      </label>
                      <select
                        value={interviewForm.mode}
                        onChange={(e) =>
                          setInterviewForm((prev) => ({
                            ...prev,
                            mode: e.target.value as InterviewMode,
                          }))
                        }
                        className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                      >
                        <option value="ONLINE">ONLINE</option>
                        <option value="ONSITE">ONSITE</option>
                      </select>
                      {interviewForm.mode === "ONLINE" && (
                        <>
                          <label className="text-sm font-medium text-stone-600">
                            Meeting link
                          </label>
                          <input
                            type="url"
                            value={interviewForm.meetingLink}
                            onChange={(e) =>
                              setInterviewForm((prev) => ({
                                ...prev,
                                meetingLink: e.target.value,
                              }))
                            }
                            placeholder="https://meet.google.com/..."
                            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                          />
                        </>
                      )}
                      {interviewForm.mode === "ONSITE" && (
                        <>
                          <label className="text-sm font-medium text-stone-600">
                            Location
                          </label>
                          <input
                            type="text"
                            value={interviewForm.location}
                            onChange={(e) =>
                              setInterviewForm((prev) => ({
                                ...prev,
                                location: e.target.value,
                              }))
                            }
                            placeholder="Office address"
                            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                          />
                        </>
                      )}
                      <label className="text-sm font-medium text-stone-600">
                        Notes
                      </label>
                      <textarea
                        value={interviewForm.notes}
                        onChange={(e) =>
                          setInterviewForm((prev) => ({
                            ...prev,
                            notes: e.target.value,
                          }))
                        }
                        placeholder="e.g. Initial technical interview"
                        rows={2}
                        className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                      />
                      <button
                        type="button"
                        disabled={
                          !interviewForm.scheduledAt.trim() || scheduleSubmitting
                        }
                        onClick={() => void handleScheduleInterview()}
                        className="self-start rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                      >
                        {scheduleSubmitting ? "Scheduling…" : "Schedule Interview"}
                      </button>
                    </div>
                    {interviewsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-stone-500">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-teal-600" />
                        Loading interviews…
                      </div>
                    ) : interviews.length === 0 ? (
                      <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
                        No interviews scheduled yet.
                      </div>
                    ) : (
                      <ul className="space-y-3">
                        {interviews.map((inv) => (
                          <li
                            key={inv.id}
                            className="rounded-lg border border-stone-200 bg-white p-3"
                          >
                            <div className="flex flex-wrap items-center gap-2 text-sm text-stone-800">
                              <span className="font-semibold">
                                {formatDateTime(inv.scheduledAt)}
                              </span>
                              <span className="text-stone-500">·</span>
                              <span>{inv.mode}</span>
                              {inv.mode === "ONLINE" && inv.meetingLink && (
                                <>
                                  <span className="text-stone-500">·</span>
                                  <a
                                    href={inv.meetingLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-stone-900 underline"
                                  >
                                    Join
                                  </a>
                                </>
                              )}
                              {inv.mode === "ONSITE" && inv.location && (
                                <>
                                  <span className="text-stone-500">·</span>
                                  <span>{inv.location}</span>
                                </>
                              )}
                            </div>
                            {inv.notes && (
                              <div className="mt-1 text-sm text-stone-600">
                                {inv.notes}
                              </div>
                            )}
                            <div className="mt-2 flex items-center gap-2">
                              <span
                                className={`rounded px-2 py-0.5 text-xs font-medium ${
                                  inv.status === "SCHEDULED"
                                    ? "bg-amber-100 text-amber-800"
                                    : inv.status === "COMPLETED"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-stone-100 text-stone-600"
                                }`}
                              >
                                {inv.status}
                              </span>
                              {inv.status === "SCHEDULED" && (
                                <>
                                  <button
                                    type="button"
                                    disabled={statusUpdatingId === inv.id}
                                    onClick={() =>
                                      handleInterviewStatus(inv.id, "COMPLETED")
                                    }
                                    className="rounded border border-stone-200 bg-white px-2 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                                  >
                                    {statusUpdatingId === inv.id
                                      ? "Updating…"
                                      : "Mark Completed"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={statusUpdatingId === inv.id}
                                    onClick={() =>
                                      handleInterviewStatus(inv.id, "CANCELLED")
                                    }
                                    className="rounded border border-rose-200 bg-white px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                </>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              )}

              {/* Activity (backend-driven timeline, newest first) */}
              <section className="rounded-lg border border-stone-200 bg-white p-4">
                <div className="text-sm font-semibold text-stone-900">
                  Activity
                </div>

                <div className="mt-3">
                  {activityLoading ? (
                    <div className="flex items-center gap-2 text-sm text-stone-500">
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-teal-600" />
                      Loading activity…
                    </div>
                  ) : activities.length === 0 ? (
                    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
                      No activity recorded yet.
                    </div>
                  ) : (
                    <ol className="space-y-4">
                      {activities.map((ev, idx) => {
                        const isLast = idx === activities.length - 1;
                        const meta = ev.metadata as Record<string, unknown> | null;
                        const actorLabel =
                          ev.actorType === "RECRUITER" ? "You" : "System";
                        const aiScore =
                          ev.type === "AI_EVALUATED" && meta && typeof meta.aiScore === "number"
                            ? meta.aiScore
                            : null;
                        const aiRec =
                          ev.type === "AI_EVALUATED" && meta && typeof meta.aiRecommendation === "string"
                            ? meta.aiRecommendation
                            : null;
                        const fromStatus = meta && typeof meta.from === "string" ? meta.from : null;
                        const toStatus = meta && typeof meta.to === "string" ? meta.to : null;
                        const statusLabel =
                          ev.type === "STATUS_CHANGED" && fromStatus && toStatus
                            ? `Moved from ${fromStatus} → ${toStatus}`
                            : ev.description;
                        const isInterviewEvent =
                          ev.type === "INTERVIEW_SCHEDULED" ||
                          ev.type === "INTERVIEW_COMPLETED" ||
                          ev.type === "INTERVIEW_CANCELLED";
                        const interviewScheduledAt =
                          isInterviewEvent && meta && meta.scheduledAt != null
                            ? String(meta.scheduledAt)
                            : null;
                        const interviewMode =
                          isInterviewEvent && meta && typeof meta.mode === "string"
                            ? meta.mode
                            : null;
                        const interviewMeetingLink =
                          isInterviewEvent && meta && typeof meta.meetingLink === "string" && meta.meetingLink
                            ? meta.meetingLink
                            : null;
                        const interviewLocation =
                          isInterviewEvent && meta && typeof meta.location === "string" && meta.location
                            ? meta.location
                            : null;
                        return (
                          <li key={ev.id} className="relative pl-8">
                            <span className="absolute left-2 top-0 h-2.5 w-2.5 rounded-full bg-teal-700" />
                            {!isLast ? (
                              <span className="absolute left-[9px] top-2 h-full w-px bg-stone-200" />
                            ) : null}

                            <div className="flex flex-col gap-0.5">
                              <div className="text-sm font-semibold text-stone-900">
                                {ev.title}
                              </div>
                              <div className="text-xs text-stone-500">
                                {formatDateTime(ev.createdAt)}
                                {actorLabel ? ` · ${actorLabel}` : ""}
                              </div>
                              <div className="text-sm text-stone-700">
                                {statusLabel}
                              </div>
                              {(aiScore !== null || aiRec) && (
                                <div className="mt-1 text-xs text-stone-600">
                                  {aiScore !== null && `Score: ${aiScore}`}
                                  {aiScore !== null && aiRec && " · "}
                                  {aiRec && `Recommendation: ${aiRec}`}
                                </div>
                              )}
                              {isInterviewEvent &&
                                (interviewScheduledAt ||
                                  interviewMode ||
                                  interviewMeetingLink ||
                                  interviewLocation) && (
                                  <div className="mt-1 text-xs text-stone-600">
                                    {interviewScheduledAt &&
                                      `${formatDateTime(interviewScheduledAt)}`}
                                    {interviewMode && ` · ${interviewMode}`}
                                    {interviewMeetingLink && (
                                      <>
                                        {" · "}
                                        <a
                                          href={interviewMeetingLink}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="underline"
                                        >
                                          Meeting link
                                        </a>
                                      </>
                                    )}
                                    {interviewLocation &&
                                      ` · ${interviewLocation}`}
                                  </div>
                                )}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </div>
              </section>

              {/* Notes */}
              <section className="rounded-lg border border-stone-200 bg-white p-4">
                <div className="text-sm font-semibold text-stone-900">
                   Notes
                </div>
                <div className="mt-3 space-y-3">
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      placeholder="Write a note…"
                      rows={3}
                      className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                    />
                    <button
                      type="button"
                      disabled={!noteContent.trim() || noteSubmitting}
                      onClick={() => void handleAddNote()}
                      className="self-start rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                    >
                      {noteSubmitting ? "Adding…" : "Add Note"}
                    </button>
                  </div>
                  {notesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-stone-500">
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-teal-600" />
                      Loading notes…
                    </div>
                  ) : notes.length === 0 ? (
                    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600">
                      No notes yet.
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {notes.map((note) => (
                        <li
                          key={note.id}
                          className="rounded-lg border border-stone-200 bg-stone-50/50 p-3"
                        >
                          <div className="whitespace-pre-wrap text-sm text-stone-800">
                            {note.content}
                          </div>
                          <div className="mt-2 text-xs text-stone-500">
                            {formatDateTime(note.createdAt)}
                            {" · You"}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              {/* Actions */}
              <section className="rounded-lg border border-stone-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-stone-900">
                    Recruiter Actions
                  </div>
                  {movingId && application.id === movingId ? (
                    <div className="text-xs font-semibold text-stone-500">
                      Updating…
                    </div>
                  ) : null}
                </div>

                {actions.length === 0 ? (
                  <div className="mt-3 text-sm text-stone-600">
                    No actions available for this stage.
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {actions.map((a) => (
                      <button
                        key={a.label}
                        type="button"
                        disabled={movingId === application.id}
                        onClick={() => onMove(application.id, a.nextStatus)}
                        className={`inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 ${actionClass(
                          a.tone
                        )}`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

