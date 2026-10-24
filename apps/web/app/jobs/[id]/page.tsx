"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { api, Job } from "../../../lib/api";

export default function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [job, setJob] = useState<Job | null>(null);
  const [coverLetter, setCoverLetter] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadJob() {
      setError("");

      try {
        const result = await api<Job>(`/jobs/${id}`);

        if (!cancelled) {
          setJob(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load job");
        }
      }
    }

    async function loadSavedState() {
      try {
        const result = await api<{ user: { role: string } | null }>("/auth/me");

        if (cancelled || !result.user) {
          return;
        }

        if (result.user.role !== "seeker") {
          return;
        }

        setAuthenticated(true);

        const savedJobs = await api<Job[]>("/saved-jobs");

        if (!cancelled) {
          setSaved(savedJobs.some((savedJob) => savedJob.id === id));
        }
      } catch {
        // Browsing remains available when the visitor is signed out.
      }
    }

    void loadJob();
    void loadSavedState();

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function toggleSaved() {
    if (saving) {
      return;
    }

    setError("");
    setMessage("");

    if (!authenticated) {
      setError("Sign in as a job seeker to save jobs.");
      return;
    }

    setSaving(true);

    try {
      if (saved) {
        await api(`/saved-jobs/${id}`, { method: "DELETE" });
        setSaved(false);
        setMessage("Job removed from your saved jobs.");
      } else {
        await api(`/saved-jobs/${id}`, { method: "PUT" });
        setSaved(true);
        setMessage("Job saved to your dashboard.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update saved job",
      );
    } finally {
      setSaving(false);
    }
  }

  async function apply() {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      await api(`/jobs/${id}/apply`, {
        method: "POST",
        body: JSON.stringify({ coverLetter }),
      });

      setMessage("Application submitted successfully!");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to submit application",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <Link href="/" className="text-blue-600">
        ← All jobs
      </Link>

      {error && (
        <p role="alert" className="mt-4 text-red-600">
          {error}
        </p>
      )}

      {message && (
        <p role="status" className="mt-4 text-green-700">
          {message}
        </p>
      )}

      {!job ? (
        <p className="mt-8">
          {error ? "Unable to load this job." : "Loading…"}
        </p>
      ) : (
        <div className="card mt-6">
          <p className="font-semibold text-blue-600">{job.company_name}</p>

          <h1 className="mt-2 text-3xl font-bold">{job.title}</h1>

          <p className="mt-3 text-slate-500">
            {job.location} · {job.type}
          </p>

          <button
            type="button"
            onClick={toggleSaved}
            disabled={saving}
            className="btn-secondary mt-6"
          >
            {saving
              ? "Updating…"
              : saved
                ? "Remove saved job"
                : "Save job for later"}
          </button>

          <h2 className="mb-3 mt-10 text-xl font-bold">About the role</h2>

          <p className="whitespace-pre-wrap text-slate-700">
            {job.description}
          </p>

          <div className="mt-9 border-t pt-7">
            <h2 className="mb-3 text-xl font-bold">Apply for this role</h2>

            <label htmlFor="cover-letter" className="label">
              Cover letter (optional)
            </label>

            <textarea
              id="cover-letter"
              rows={5}
              maxLength={5000}
              value={coverLetter}
              onChange={(event) => setCoverLetter(event.target.value)}
              placeholder="Tell the employer why you're a good fit"
            />

            <button
              type="button"
              onClick={apply}
              disabled={busy}
              className="btn mt-4"
            >
              {busy ? "Submitting…" : "Submit application"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
