"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";

type Alert = {
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
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

const types = ["full-time", "part-time", "contract", "internship"];

export default function JobAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [keyword, setKeyword] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const refresh = useCallback(async () => {
    const [a, n] = await Promise.all([
      api<Alert[]>("/job-alerts"),
      api<{
        notifications: Notification[];
        unreadCount: number;
      }>("/notifications"),
    ]);

    setAlerts(a);
    setNotifications(n.notifications);
    setUnread(n.unreadCount);
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        await refresh();
      } catch (e) {
        if (active) {
          setError(
            e instanceof Error ? e.message : "Unable to load job alerts",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [refresh]);

  async function createAlert(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      await api("/job-alerts", {
        method: "POST",
        body: JSON.stringify({
          keyword: keyword.trim(),
          location: location.trim(),
          type: type || null,
        }),
      });

      setKeyword("");
      setLocation("");
      setType("");
      await refresh();
      setSuccess("Job alert created successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create alert");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAlert(id: string) {
    setError("");
    setSuccess("");

    try {
      await api(`/job-alerts/${id}`, { method: "DELETE" });
      setAlerts((current) => current.filter((a) => a.id !== id));
      setSuccess("Job alert removed.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to remove alert");
    }
  }

  async function markRead(id: string) {
    setError("");

    try {
      await api(`/notifications/${id}/read`, { method: "PATCH" });

      setNotifications((current) =>
        current.map((n) =>
          n.id === id && !n.read_at
            ? { ...n, read_at: new Date().toISOString() }
            : n,
        ),
      );

      setUnread((count) => {
        const notification = notifications.find((n) => n.id === id);
        return notification && !notification.read_at
          ? Math.max(0, count - 1)
          : count;
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to update notification",
      );
    }
  }

  return (
    <div className="grid items-start gap-7 lg:grid-cols-2">
      <section className="card space-y-5">
        <div>
          <h2 className="text-xl font-bold">Job alerts</h2>
          <p className="mt-1 text-sm text-slate-500">
            Get in-app notifications when a published job matches your criteria.
          </p>
        </div>

        <form onSubmit={createAlert} className="space-y-4">
          <div>
            <label htmlFor="alert-keyword" className="label">
              Keyword
            </label>
            <input
              id="alert-keyword"
              maxLength={100}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Developer, designer..."
            />
          </div>

          <div>
            <label htmlFor="alert-location" className="label">
              Location
            </label>
            <input
              id="alert-location"
              maxLength={100}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Remote, Cairo..."
            />
          </div>

          <div>
            <label htmlFor="alert-type" className="label">
              Employment type
            </label>
            <select
              id="alert-type"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">Any type</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll("-", " ")}
                </option>
              ))}
            </select>
          </div>

          <button
            className="btn w-full"
            disabled={busy || (!keyword.trim() && !location.trim() && !type)}
          >
            {busy ? "Creating…" : "Create job alert"}
          </button>
        </form>

        <div className="space-y-3">
          <h3 className="font-bold">Your alerts ({alerts.length})</h3>

          {loading ? (
            <p className="text-sm text-slate-500">Loading alerts…</p>
          ) : alerts.length === 0 ? (
            <p className="text-sm text-slate-500">
              No alerts yet. Create one above to get started.
            </p>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold">
                    {[
                      alert.keyword,
                      alert.location,
                      alert.type?.replaceAll("-", " "),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Created {new Date(alert.created_at).toLocaleDateString()}
                  </p>
                </div>

                <button
                  type="button"
                  className="shrink-0 text-sm font-semibold text-red-600 hover:underline"
                  onClick={() => void deleteAlert(alert.id)}
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="card">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Notifications</h2>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">
            {unread} unread
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading notifications…</p>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-slate-500">
            No notifications yet. We'll show matching jobs here.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((notification) => (
              <article key={notification.id} className="py-4">
                <div className="flex items-start gap-3">
                  <span
                    className={
                      "mt-2 h-2.5 w-2.5 shrink-0 rounded-full " +
                      (notification.read_at ? "bg-slate-300" : "bg-blue-600")
                    }
                    aria-label={notification.read_at ? "Read" : "Unread"}
                  />

                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{notification.title}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {notification.message}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {new Date(notification.created_at).toLocaleString()}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-4 text-sm">
                      {notification.job_id && (
                        <Link
                          className="font-semibold text-blue-600 hover:underline"
                          href={`/jobs/${notification.job_id}`}
                        >
                          View job
                        </Link>
                      )}

                      {!notification.read_at && (
                        <button
                          type="button"
                          className="font-semibold text-slate-600 hover:underline"
                          onClick={() => void markRead(notification.id)}
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {error && (
        <p role="alert" className="text-sm text-red-600 lg:col-span-2">
          {error}
        </p>
      )}

      {success && (
        <p role="status" className="text-sm text-green-700 lg:col-span-2">
          {success}
        </p>
      )}
    </div>
  );
}
