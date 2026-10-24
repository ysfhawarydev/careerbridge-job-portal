"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, User, Job } from "../../lib/api";
import ApplicationTimeline from "./ApplicationTimeline";

type Company = {
  id: string;
  name: string;
};

type Profile = {
  full_name: string;
  headline: string;
  location: string;
  bio: string;
};

type Application = {
  id: string;
  status: string;
  title: string;
  company_name: string;
  created_at: string;
};

type JobAlert = {
  id: string;
  keyword: string;
  location: string;
  type: string | null;
  is_active: boolean;
  created_at: string;
};

type Notification = {
  id: string;
  job_id: string | null;
  kind: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

const EMPLOYMENT_TYPES = [
  "full-time",
  "part-time",
  "contract",
  "internship",
] as const;

const EMPTY_PROFILE: Profile = {
  full_name: "",
  headline: "",
  location: "",
  bio: "",
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [saved, setSaved] = useState<Job[]>([]);
  const [saving, setSaving] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);

  const [companyName, setCompanyName] = useState("");
  const [companyDescription, setCompanyDescription] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("Remote");
  const [type, setType] = useState("full-time");
  const [companyId, setCompanyId] = useState("");

  const [alerts, setAlerts] = useState<JobAlert[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const [alertKeyword, setAlertKeyword] = useState("");
  const [alertLocation, setAlertLocation] = useState("");
  const [alertType, setAlertType] = useState("");

  const [alertsLoading, setAlertsLoading] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [alertSaving, setAlertSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const refresh = useCallback(async (role: string) => {
    if (role === "employer") {
      const [companyList, jobList] = await Promise.all([
        api<Company[]>("/companies/mine"),
        api<Job[]>("/employer/jobs"),
      ]);

      setCompanies(companyList);
      setJobs(jobList);
      setCompanyId((current) => current || companyList[0]?.id || "");
    }

    if (role === "seeker") {
      const [applicationList, seekerProfile, savedJobs] = await Promise.all([
        api<Application[]>("/applications/mine"),
        api<Profile>("/profile"),
        api<Job[]>("/saved-jobs"),
      ]);

      setApplications(applicationList);
      setProfile(seekerProfile);
      setSaved(savedJobs);
    }
  }, []);

  const refreshAlerts = useCallback(async () => {
    setAlertsLoading(true);

    try {
      const result = await api<JobAlert[]>("/job-alerts");
      setAlerts(result);
    } catch (err) {
      setError(errorMessage(err, "Unable to load job alerts"));
    } finally {
      setAlertsLoading(false);
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    setNotificationsLoading(true);

    try {
      const result = await api<Notification[]>("/notifications");
      setNotifications(result);
    } catch (err) {
      setError(errorMessage(err, "Unable to load notifications"));
    } finally {
      setNotificationsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const result = await api<{ user: User | null }>("/auth/me");

        if (!active) return;

        setUser(result.user);

        if (result.user) {
          await refresh(result.user.role);

          if (!active) return;

          if (result.user.role === "seeker") {
            await Promise.all([refreshAlerts(), refreshNotifications()]);
          }
        }
      } catch (err) {
        if (active) {
          setError(errorMessage(err, "Unable to load your dashboard"));
        }
      } finally {
        if (active) {
          setReady(true);
        }
      }
    }

    void initialize();

    return () => {
      active = false;
    };
  }, [refresh, refreshAlerts, refreshNotifications]);

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      await api("/profile", {
        method: "PATCH",
        body: JSON.stringify({
          fullName: profile.full_name,
          headline: profile.headline,
          location: profile.location,
          bio: profile.bio,
        }),
      });

      setSuccess("Profile updated successfully");
      await refresh("seeker");
    } catch (err) {
      setError(errorMessage(err, "Unable to update profile"));
    } finally {
      setSaving(false);
    }
  }

  async function unsave(id: string) {
    setError("");
    setSuccess("");

    try {
      await api("/saved-jobs/" + id, {
        method: "DELETE",
      });

      setSaved((current) => current.filter((job) => job.id !== id));
      setSuccess("Saved job removed");
    } catch (err) {
      setError(errorMessage(err, "Unable to remove saved job"));
    }
  }

  async function updateJobStatus(id: string, status: string) {
    setError("");
    setSuccess("");

    try {
      await api("/employer/jobs/" + id, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });

      setSuccess("Job status updated");
      await refresh("employer");
    } catch (err) {
      setError(errorMessage(err, "Unable to update job"));
    }
  }

  async function createCompany(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      await api("/companies", {
        method: "POST",
        body: JSON.stringify({
          name: companyName,
          description: companyDescription,
        }),
      });

      setCompanyName("");
      setCompanyDescription("");
      setSuccess("Company created successfully");

      await refresh("employer");
    } catch (err) {
      setError(errorMessage(err, "Unable to create company"));
    }
  }

  async function createJob(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");

    try {
      await api("/jobs", {
        method: "POST",
        body: JSON.stringify({
          companyId,
          title,
          description,
          location,
          type,
        }),
      });

      setTitle("");
      setDescription("");
      setSuccess("Job published successfully");

      await refresh("employer");
    } catch (err) {
      setError(errorMessage(err, "Unable to publish job"));
    }
  }

  async function createJobAlert(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setAlertSaving(true);

    try {
      const alert = await api<JobAlert>("/job-alerts", {
        method: "POST",
        body: JSON.stringify({
          keyword: alertKeyword.trim(),
          location: alertLocation.trim(),
          type: alertType || null,
        }),
      });

      setAlerts((current) => [
        alert,
        ...current.filter((item) => item.id !== alert.id),
      ]);

      setAlertKeyword("");
      setAlertLocation("");
      setAlertType("");

      setSuccess("Job alert created successfully");
    } catch (err) {
      setError(errorMessage(err, "Unable to create job alert"));
    } finally {
      setAlertSaving(false);
    }
  }

  async function toggleJobAlert(alert: JobAlert) {
    setError("");
    setSuccess("");

    try {
      const updated = await api<JobAlert>("/job-alerts/" + alert.id, {
        method: "PATCH",
        body: JSON.stringify({
          isActive: !alert.is_active,
        }),
      });

      setAlerts((current) =>
        current.map((item) => (item.id === alert.id ? updated : item)),
      );

      setSuccess(updated.is_active ? "Job alert enabled" : "Job alert paused");
    } catch (err) {
      setError(errorMessage(err, "Unable to update job alert"));
    }
  }

  async function deleteJobAlert(id: string) {
    setError("");
    setSuccess("");

    try {
      await api("/job-alerts/" + id, {
        method: "DELETE",
      });

      setAlerts((current) => current.filter((item) => item.id !== id));
      setSuccess("Job alert deleted");
    } catch (err) {
      setError(errorMessage(err, "Unable to delete job alert"));
    }
  }

  async function markNotificationRead(notification: Notification) {
    if (notification.is_read) return;

    setError("");

    try {
      const updated = await api<Notification>(
        "/notifications/" + notification.id + "/read",
        {
          method: "PATCH",
        },
      );

      setNotifications((current) =>
        current.map((item) => (item.id === notification.id ? updated : item)),
      );
    } catch (err) {
      setError(errorMessage(err, "Unable to mark notification as read"));
    }
  }

  const unreadCount = notifications.filter(
    (notification) => !notification.is_read,
  ).length;

  return (
    <main className="mx-auto max-w-6xl px-5 py-12">
      {!ready ? (
        <p className="text-slate-500">Loading dashboard…</p>
      ) : !user ? (
        <div className="card">
          <h1 className="text-2xl font-bold">Sign in to continue</h1>
          <p className="mt-2 text-slate-500">
            Sign in to access your dashboard and manage your opportunities.
          </p>
          <Link className="btn mt-5 inline-block" href="/login">
            Sign in
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-8">
            <p className="font-semibold capitalize text-blue-600">
              {user.role} dashboard
            </p>

            <h1 className="mt-1 text-3xl font-bold">
              Welcome, {user.full_name}
            </h1>

            <p className="mt-1 text-slate-500">
              Manage your opportunities in one place.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700"
            >
              {error}
              <button
                type="button"
                className="ml-3 font-semibold underline"
                onClick={() => setError("")}
              >
                Dismiss
              </button>
            </div>
          )}

          {success && (
            <div
              role="status"
              className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800"
            >
              {success}
              <button
                type="button"
                className="ml-3 font-semibold underline"
                onClick={() => setSuccess("")}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Employer dashboard */}
          {user.role === "employer" ? (
            <div className="grid gap-6 md:grid-cols-2">
              <section className="space-y-6">
                <form onSubmit={createCompany} className="card space-y-4">
                  <h2 className="text-xl font-bold">Create a company</h2>

                  <div>
                    <label htmlFor="company-name" className="label">
                      Company name
                    </label>
                    <input
                      id="company-name"
                      required
                      minLength={2}
                      maxLength={150}
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label htmlFor="company-description" className="label">
                      Description
                    </label>
                    <textarea
                      id="company-description"
                      maxLength={5000}
                      value={companyDescription}
                      onChange={(e) => setCompanyDescription(e.target.value)}
                    />
                  </div>

                  <button className="btn" type="submit">
                    Create company
                  </button>
                </form>

                <form onSubmit={createJob} className="card space-y-4">
                  <h2 className="text-xl font-bold">Post a new job</h2>

                  <div>
                    <label htmlFor="job-company" className="label">
                      Company
                    </label>
                    <select
                      id="job-company"
                      required
                      value={companyId}
                      onChange={(e) => setCompanyId(e.target.value)}
                    >
                      {companies.length === 0 && (
                        <option value="">Create a company first</option>
                      )}

                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="job-title" className="label">
                      Job title
                    </label>
                    <input
                      id="job-title"
                      required
                      minLength={3}
                      maxLength={200}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>

                  <div>
                    <label htmlFor="job-description" className="label">
                      Job description (20+ characters)
                    </label>
                    <textarea
                      id="job-description"
                      required
                      minLength={20}
                      maxLength={20000}
                      rows={6}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>

                  <div>
                    <label htmlFor="job-location" className="label">
                      Location
                    </label>
                    <input
                      id="job-location"
                      required
                      minLength={2}
                      maxLength={150}
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                    />
                  </div>

                  <div>
                    <label htmlFor="job-type" className="label">
                      Employment type
                    </label>
                    <select
                      id="job-type"
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                    >
                      {EMPLOYMENT_TYPES.map((employmentType) => (
                        <option key={employmentType} value={employmentType}>
                          {employmentType.replaceAll("-", " ")}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button disabled={!companyId} className="btn" type="submit">
                    Publish job
                  </button>
                </form>
              </section>

              <section className="card self-start">
                <h2 className="mb-5 text-xl font-bold">Your job listings</h2>

                {jobs.length === 0 ? (
                  <p className="text-slate-500">No jobs published yet.</p>
                ) : (
                  <div className="space-y-4">
                    {jobs.map((job) => (
                      <div
                        className="border-b border-slate-100 pb-4"
                        key={job.id}
                      >
                        <Link
                          className="font-semibold text-blue-600 hover:underline"
                          href={"/jobs/" + job.id}
                        >
                          {job.title}
                        </Link>

                        <p className="mt-1 text-sm text-slate-500">
                          {job.company_name} · {job.location} ·{" "}
                          {job.applicants ?? 0} applicants
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <Link
                            className="text-sm text-blue-600 underline"
                            href={"/dashboard/applicants/" + job.id}
                          >
                            Review applicants →
                          </Link>

                          <label
                            className="text-xs font-semibold text-slate-600"
                            htmlFor={"status-" + job.id}
                          >
                            Visibility
                          </label>

                          <select
                            id={"status-" + job.id}
                            aria-label={"Status for " + job.title}
                            className="max-w-40 text-sm"
                            value={
                              (job as Job & { status?: string }).status ??
                              "published"
                            }
                            onChange={(e) =>
                              updateJobStatus(job.id, e.target.value)
                            }
                          >
                            <option value="draft">Draft</option>
                            <option value="published">Published</option>
                            <option value="closed">Closed</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : user.role === "seeker" ? (
            <div className="space-y-8">
              {/* Dashboard statistics */}
              <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: "Applications",
                    value: applications.length,
                  },
                  {
                    label: "Saved jobs",
                    value: saved.length,
                  },
                  {
                    label: "In progress",
                    value: applications.filter((application) =>
                      ["reviewing", "shortlisted"].includes(application.status),
                    ).length,
                  },
                  {
                    label: "Unread notifications",
                    value: unreadCount,
                  },
                ].map((stat) => (
                  <div className="card" key={stat.label}>
                    <p className="text-sm font-semibold text-slate-500">
                      {stat.label}
                    </p>
                    <p className="mt-3 text-4xl font-extrabold text-slate-900">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </section>

              {/* Notifications */}
              <section className="card">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold">Notifications</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Updates about jobs matching your alerts.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={notificationsLoading}
                    onClick={() => void refreshNotifications()}
                  >
                    {notificationsLoading ? "Refreshing…" : "Refresh"}
                  </button>
                </div>

                {notificationsLoading && notifications.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Loading notifications…
                  </p>
                ) : notifications.length === 0 ? (
                  <div className="rounded-xl bg-slate-50 p-6 text-center">
                    <h3 className="font-semibold">You’re all caught up</h3>
                    <p className="mt-2 text-sm text-slate-500">
                      New job matches will appear here when they become
                      available.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {notifications.map((notification) => (
                      <article
                        key={notification.id}
                        className={
                          "flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between " +
                          (!notification.is_read ? "bg-blue-50/50 " : "")
                        }
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {!notification.is_read && (
                              <span
                                className="h-2 w-2 shrink-0 rounded-full bg-blue-600"
                                aria-label="Unread"
                              />
                            )}

                            <h3 className="font-semibold text-slate-900">
                              {notification.title}
                            </h3>
                          </div>

                          <p className="mt-1 text-sm text-slate-600">
                            {notification.message}
                          </p>

                          <p className="mt-2 text-xs text-slate-400">
                            {formatDate(notification.created_at)}
                          </p>

                          {notification.job_id && (
                            <Link
                              className="mt-2 inline-block text-sm font-semibold text-blue-600 hover:underline"
                              href={"/jobs/" + notification.job_id}
                            >
                              View job →
                            </Link>
                          )}
                        </div>

                        {!notification.is_read && (
                          <button
                            type="button"
                            className="shrink-0 text-left text-sm font-semibold text-blue-600 hover:underline sm:text-right"
                            onClick={() =>
                              void markNotificationRead(notification)
                            }
                          >
                            Mark as read
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {/* Job alerts */}
              <section className="card">
                <div className="mb-6">
                  <h2 className="text-xl font-bold">Job alerts</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Create search criteria to receive notifications when
                    matching jobs are published.
                  </p>
                </div>

                <form
                  onSubmit={createJobAlert}
                  className="mb-8 grid gap-4 rounded-2xl bg-slate-50 p-5 md:grid-cols-2"
                >
                  <div>
                    <label htmlFor="alert-keyword" className="label">
                      Job title or keyword
                    </label>
                    <input
                      id="alert-keyword"
                      maxLength={100}
                      placeholder="e.g. Frontend Developer"
                      value={alertKeyword}
                      onChange={(e) => setAlertKeyword(e.target.value)}
                    />
                  </div>

                  <div>
                    <label htmlFor="alert-location" className="label">
                      Location
                    </label>
                    <input
                      id="alert-location"
                      maxLength={100}
                      placeholder="e.g. Remote or Cairo"
                      value={alertLocation}
                      onChange={(e) => setAlertLocation(e.target.value)}
                    />
                  </div>

                  <div>
                    <label htmlFor="alert-type" className="label">
                      Employment type
                    </label>
                    <select
                      id="alert-type"
                      value={alertType}
                      onChange={(e) => setAlertType(e.target.value)}
                    >
                      <option value="">All employment types</option>
                      {EMPLOYMENT_TYPES.map((employmentType) => (
                        <option key={employmentType} value={employmentType}>
                          {employmentType.replaceAll("-", " ")}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-end">
                    <button
                      className="btn w-full"
                      type="submit"
                      disabled={alertSaving}
                    >
                      {alertSaving ? "Creating alert…" : "Create job alert"}
                    </button>
                  </div>

                  <p className="text-xs text-slate-500 md:col-span-2">
                    Leave the keyword, location, or employment type empty to
                    match more opportunities.
                  </p>
                </form>

                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="font-bold">Your alerts ({alerts.length})</h3>

                  <button
                    type="button"
                    className="text-sm font-semibold text-blue-600 hover:underline"
                    disabled={alertsLoading}
                    onClick={() => void refreshAlerts()}
                  >
                    {alertsLoading ? "Refreshing…" : "Refresh alerts"}
                  </button>
                </div>

                {alertsLoading && alerts.length === 0 ? (
                  <p className="text-sm text-slate-500">Loading job alerts…</p>
                ) : alerts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
                    <h3 className="font-semibold">No job alerts yet</h3>
                    <p className="mt-2 text-sm text-slate-500">
                      Create an alert above to start receiving relevant job
                      match notifications.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {alerts.map((alert) => (
                      <article
                        key={alert.id}
                        className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-slate-900">
                              {alert.keyword || "All job titles"}
                            </h3>

                            <span
                              className={
                                "rounded-full px-2.5 py-1 text-xs font-semibold " +
                                (alert.is_active
                                  ? "bg-green-50 text-green-700"
                                  : "bg-slate-100 text-slate-600")
                              }
                            >
                              {alert.is_active ? "Active" : "Paused"}
                            </span>
                          </div>

                          <p className="mt-2 text-sm text-slate-500">
                            {alert.location || "Any location"}
                            {" · "}
                            {alert.type
                              ? alert.type.replaceAll("-", " ")
                              : "All employment types"}
                          </p>

                          <p className="mt-1 text-xs text-slate-400">
                            Created {formatDate(alert.created_at)}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-wrap items-center gap-3">
                          <button
                            type="button"
                            className="text-sm font-semibold text-blue-600 hover:underline"
                            onClick={() => void toggleJobAlert(alert)}
                          >
                            {alert.is_active ? "Pause" : "Activate"}
                          </button>

                          <button
                            type="button"
                            className="text-sm font-semibold text-red-600 hover:underline"
                            onClick={() => void deleteJobAlert(alert.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {/* Profile and applications */}
              <div className="grid items-start gap-7 lg:grid-cols-5">
                <form
                  onSubmit={saveProfile}
                  className="card space-y-4 lg:col-span-2"
                >
                  <div>
                    <h2 className="text-xl font-bold">Your profile</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Help employers get to know you.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="profile-name" className="label">
                      Full name
                    </label>
                    <input
                      id="profile-name"
                      required
                      minLength={2}
                      maxLength={120}
                      value={profile.full_name}
                      onChange={(e) =>
                        setProfile((current) => ({
                          ...current,
                          full_name: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <label htmlFor="profile-headline" className="label">
                      Professional headline
                    </label>
                    <input
                      id="profile-headline"
                      maxLength={180}
                      placeholder="Frontend engineer"
                      value={profile.headline}
                      onChange={(e) =>
                        setProfile((current) => ({
                          ...current,
                          headline: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <label htmlFor="profile-location" className="label">
                      Location
                    </label>
                    <input
                      id="profile-location"
                      maxLength={150}
                      placeholder="City or remote"
                      value={profile.location}
                      onChange={(e) =>
                        setProfile((current) => ({
                          ...current,
                          location: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <label htmlFor="profile-bio" className="label">
                      About you
                    </label>
                    <textarea
                      id="profile-bio"
                      rows={5}
                      maxLength={3000}
                      value={profile.bio}
                      onChange={(e) =>
                        setProfile((current) => ({
                          ...current,
                          bio: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <button
                    className="btn w-full"
                    type="submit"
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Save profile"}
                  </button>
                </form>

                <div className="space-y-7 lg:col-span-3">
                  <section className="card">
                    <div className="mb-5 flex items-center justify-between gap-3">
                      <h2 className="text-xl font-bold">Applications</h2>
                      <Link
                        className="text-sm font-semibold text-blue-600"
                        href="/"
                      >
                        Find jobs →
                      </Link>
                    </div>

                    {applications.length === 0 ? (
                      <div className="rounded-xl bg-slate-50 p-7 text-center">
                        <p className="font-semibold">No applications yet</p>
                        <p className="mt-2 text-sm text-slate-500">
                          Explore opportunities and submit your first
                          application.
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {applications.map((application) => (
                          <div
                            className="flex items-center justify-between gap-4 py-4"
                            key={application.id}
                          >
                            <div>
                              <p className="font-semibold">
                                {application.title}
                              </p>
                              <p className="text-sm text-slate-500">
                                {application.company_name}
                                {" · "}
                                {formatDate(application.created_at)}
                              </p>
                            </div>

                            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold capitalize text-blue-700">
                              {application.status}
                            </span>
                            <ApplicationTimeline
                              applicationId={application.id}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="card">
                    <h2 className="mb-5 text-xl font-bold">Saved jobs</h2>

                    {saved.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No saved jobs yet. Open a job to bookmark it for later.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {saved.map((job) => (
                          <div
                            key={job.id}
                            className="flex flex-col gap-3 py-4"
                          >
                            <div>
                              <Link
                                href={"/jobs/" + job.id}
                                className="font-semibold text-blue-600 hover:underline"
                              >
                                {job.title}
                              </Link>

                              <p className="text-sm text-slate-500">
                                {job.company_name} · {job.location}
                              </p>
                            </div>

                            <button
                              type="button"
                              className="text-sm font-semibold text-red-600 hover:underline"
                              onClick={() => void unsave(job.id)}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              <h2 className="text-xl font-bold">Admin dashboard</h2>
              <p className="mt-2 text-slate-500">
                Admin account authenticated. Moderation tools are planned for a
                later release.
              </p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
