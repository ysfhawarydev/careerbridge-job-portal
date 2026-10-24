CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK(role IN ('seeker','employer','admin')),
  full_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  owner_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  title text NOT NULL,
  description text NOT NULL,
  location text NOT NULL DEFAULT 'Remote',
  type text NOT NULL CHECK(type IN ('full-time','part-time','contract','internship')),
  salary_min integer CHECK(salary_min IS NULL OR salary_min >= 0),
  salary_max integer CHECK(salary_max IS NULL OR salary_max >= 0),
  status text NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max)
);
CREATE INDEX jobs_recent_idx ON jobs(created_at DESC,id DESC) WHERE status='published';
CREATE INDEX jobs_search_idx ON jobs USING GIN(to_tsvector('english',title || ' ' || description));
CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id),
  seeker_id uuid NOT NULL REFERENCES users(id),
  cover_letter text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','reviewing','shortlisted','rejected','hired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(job_id,seeker_id)
);
CREATE INDEX applications_seeker_idx ON applications(seeker_id,created_at DESC);
CREATE INDEX applications_job_idx ON applications(job_id,created_at DESC);
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE TABLE saved_jobs (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id,job_id)
);
