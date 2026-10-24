"use client";

import { useState } from "react";
import { api } from "../../lib/api";

type TimelineEntry = {
  id: string;
  application_id: string;
  status: "submitted" | "reviewing" | "shortlisted" | "rejected" | "hired";
  note: string;
  created_at: string;
  changed_by_name: string | null;
};

type ApplicationTimelineProps = {
  applicationId: string;
};

const STATUS_STYLES: Record<string, string> = {
  submitted: "bg-slate-100 text-slate-700",
  reviewing: "bg-blue-100 text-blue-700",
  shortlisted: "bg-violet-100 text-violet-700",
  rejected: "bg-red-100 text-red-700",
  hired: "bg-green-100 text-green-700",
};

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function ApplicationTimeline({
  applicationId,
}: ApplicationTimelineProps) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  async function toggleTimeline() {
    if (open) {
      setOpen(false);
      return;
    }

    setOpen(true);

    if (loaded) return;

    setLoading(true);
    setError("");

    try {
      const result = await api<TimelineEntry[]>(
        `/applications/${applicationId}/timeline`,
      );

      setEntries(result);
      setLoaded(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load application timeline",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mt-3">
      <button
        type="button"
        onClick={toggleTimeline}
        aria-expanded={open}
        className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-800"
      >
        {open ? "Hide timeline" : "Track application"}
        <span aria-hidden="true">{open ? "↑" : "↓"}</span>
      </button>

      {open && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="mb-4 font-semibold text-slate-900">
            Application history
          </h3>

          {loading && (
            <p role="status" className="text-sm text-slate-500">
              Loading timeline...
            </p>
          )}

          {error && (
            <div>
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>

              <button
                type="button"
                onClick={() => {
                  setLoaded(false);
                  void toggleTimeline();
                }}
                className="mt-2 text-sm font-semibold text-blue-600 hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && loaded && entries.length === 0 && (
            <p className="text-sm text-slate-500">
              No application history is available yet.
            </p>
          )}

          {!loading && !error && entries.length > 0 && (
            <ol className="space-y-0">
              {entries.map((entry, index) => (
                <li
                  key={entry.id}
                  className="relative flex gap-3 pb-5 last:pb-0"
                >
                  <div className="flex flex-col items-center">
                    <span
                      className={`mt-1 flex h-3 w-3 shrink-0 rounded-full ring-4 ring-slate-50 ${
                        index === entries.length - 1
                          ? "bg-blue-600"
                          : "bg-slate-300"
                      }`}
                    />

                    {index !== entries.length - 1 && (
                      <span className="mt-1 w-px flex-1 bg-slate-200" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          STATUS_STYLES[entry.status] ??
                          "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {formatStatus(entry.status)}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-slate-800">
                      {entry.note || "Application status updated"}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {formatDate(entry.created_at)}
                    </p>

                    {entry.changed_by_name && (
                      <p className="mt-1 text-xs text-slate-500">
                        Updated by {entry.changed_by_name}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
