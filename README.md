# CareerBridge — Job Portal

Runnable MVP: Next.js 15 + Fastify 5 + PostgreSQL + postgres.js + Redis. **No ORM.**

## Prerequisites
Node.js 22+, pnpm 9+, Docker with Compose.

## Run locally
```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate
pnpm dev
```
Open http://localhost:3000. API: http://localhost:4000/health.

Environment variables in `.env` are for local development. Run commands from the repository root; pnpm scripts run in the relevant workspace package. API startup reads the default local database and Redis URLs. For custom URLs export variables in your shell or load `.env` (e.g. `set -a; . ./.env; set +a`) before running pnpm. `NEXT_PUBLIC_API_URL` must be set before building the frontend.

## Test the complete flow
1. Register as an employer.
2. Create a company in Dashboard.
3. Publish a job.
4. Logout and register a separate job seeker.
5. Search the job on the homepage and apply.
6. Log back in as the employer and review the application.

## Routes
- `GET /health`, `GET /jobs`, `GET /jobs/:id`
- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `POST /companies`, `GET /companies/mine`
- `POST /jobs`, `GET /employer/jobs`
- `POST /jobs/:id/apply`, `GET /applications/mine`
- `GET /employer/jobs/:id/applications`, `PATCH /employer/applications/:id`

## Security and production notes
- Passwords use salted scrypt; sessions are random bearer tokens hashed in PostgreSQL.
- Queries are parameterized using postgres.js tagged templates; migration files are trusted local SQL.
- Session cookies are HttpOnly and SameSite=Lax. For production, add CSRF defenses, email verification, password reset, stricter validation, audit logs, observability, and an explicit reverse proxy/TLS configuration.
- Redis caches public job lists for 20 seconds; newly published jobs may take up to 20 seconds to appear.
- PostgreSQL migrations are versioned and tracked in `schema_migrations`.
- This is a runnable foundation, **not** a fully hardened production release. No payment, resume upload, interview scheduler, notification worker, or admin moderation interface is included.


## Frontend refresh

Updated landing page, job discovery cards, mobile navigation, responsive styles, and a safe JSON fetch helper. API startup and migrations now load the repository root `.env` using `dotenv`. Run `pnpm install`, `docker compose up -d`, `pnpm db:migrate`, and `pnpm dev`. If ports 5432/5433 are occupied, use `127.0.0.1:55432:5432` in Docker Compose and set `DATABASE_URL=postgres://portal:portal@127.0.0.1:55432/portal` in `.env`. The archive excludes secrets and node_modules.
