CREATE TABLE job_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  keyword text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  type text CHECK (
    type IS NULL
    OR type IN (
      'full-time',
      'part-time',
      'contract',
      'internship'
    )
  ),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now (),
  updated_at timestamptz NOT NULL DEFAULT now ()
);

CREATE INDEX job_alerts_user_idx ON job_alerts (user_id, created_at DESC);

CREATE INDEX job_alerts_active_idx ON job_alerts (is_active)
WHERE
  is_active = true;

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs (id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now ()
);

CREATE UNIQUE INDEX notifications_user_job_kind_idx ON notifications (user_id, job_id, kind)
WHERE
  job_id IS NOT NULL;

CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC);

CREATE INDEX notifications_unread_idx ON notifications (user_id, created_at DESC)
WHERE
  is_read = false;