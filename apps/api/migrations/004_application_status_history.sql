CREATE TABLE application_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (
    status IN (
      'submitted',
      'reviewing',
      'shortlisted',
      'rejected',
      'hired'
    )
  ),
  changed_by uuid REFERENCES users (id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now ()
);

CREATE INDEX application_status_history_application_idx ON application_status_history (application_id, created_at ASC, id ASC);

INSERT INTO
  application_status_history (
    application_id,
    status,
    changed_by,
    note,
    created_at
  )
SELECT
  a.id,
  a.status,
  NULL,
  'Status recorded when application timeline was introduced',
  a.created_at
FROM
  applications a;