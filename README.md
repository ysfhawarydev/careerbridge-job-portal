# CareerBridge

**A full-stack job portal for job seekers and employers.** Discover opportunities, manage job postings, track applications, and stay informed with saved jobs and in-app alerts.

[![Release](https://img.shields.io/github/v/release/ysfhawarydev/careerbridge-job-portal?label=release)](https://github.com/ysfhawarydev/careerbridge-job-portal/releases/tag/v1.0.0)
[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/ysfhawarydev/careerbridge-job-portal/api-ci.yml?branch=main&label=API%20CI)](https://github.com/ysfhawarydev/careerbridge-job-portal/actions)
[![License](https://img.shields.io/badge/license-not%20specified-lightgrey)](#license)

> **Release:** v1.0.0 · **Status:** Locally runnable portfolio project · **Deployment:** Not hosted

CareerBridge demonstrates a complete job marketplace workflow with a Next.js frontend, a Fastify API, PostgreSQL persistence, Redis caching, and automated integration tests. It is designed to run locally; **there is no public live demo**.

## Features

| Job seekers | Employers |
| --- | --- |
| Browse, search, sort, and filter jobs | Create and manage companies |
| Filter by location, job type, and salary range | Create, publish, and close job listings |
| View job details and apply | Set and edit optional salary ranges |
| Save jobs for later | Review applicants and update application statuses |
| Follow application status history | View applicant details and application progress |
| Create job alerts and receive in-app notifications | Manage jobs from the employer dashboard |

### Platform capabilities

- Role-based access controls and ownership checks
- Account registration, login, and logout
- Input validation and parameterized SQL queries
- Pagination and salary-aware job search
- PostgreSQL schema migrations
- Redis caching for public job listings
- Rate limiting, security headers, and health/readiness endpoints
- Automated API tests and GitHub Actions CI

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS |
| Backend | Fastify 5, TypeScript, Zod |
| Database | PostgreSQL 17, postgres.js (no ORM) |
| Cache | Redis 7 |
| Tooling | pnpm, Docker Compose, Vitest, GitHub Actions |

## Architecture

```text
┌────────────────────────────┐
│ Next.js frontend           │
│ http://localhost:3000      │
└─────────────┬──────────────┘
              │ HTTP / JSON
              ▼
┌────────────────────────────┐
│ Fastify REST API           │
│ http://localhost:4000      │
│ Auth · Jobs · Applications │
│ Alerts · Notifications     │
└────────┬───────────┬───────┘
         │           │
         ▼           ▼
┌────────────────┐ ┌────────────────┐
│ PostgreSQL 17  │ │ Redis 7        │
│ Persistent data│ │ Job-list cache │
└────────────────┘ └────────────────┘
```

### Repository layout

```text
.
├── apps/
│   ├── api/           # Fastify API, migrations, and tests
│   └── web/           # Next.js application
├── docker-compose.yml # Local PostgreSQL and Redis
├── .env.example       # Example local configuration
├── pnpm-workspace.yaml
└── package.json       # Workspace scripts
```

## Getting started

### Prerequisites

- **Node.js 22+**
- **pnpm 9+**
- **Docker** with Docker Compose

### 1. Clone and configure

```bash
git clone https://github.com/ysfhawarydev/careerbridge-job-portal.git
cd careerbridge-job-portal
cp .env.example .env
pnpm install
```

The provided local configuration uses:

| Variable | Example |
| --- | --- |
| `DATABASE_URL` | `postgres://portal:portal@127.0.0.1:55432/portal` |
| `REDIS_URL` | `redis://127.0.0.1:6379` |
| `API_PORT` | `4000` |
| `WEB_ORIGIN` | `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000` |

Review `.env.example` in the repository for the authoritative list of settings. Local credentials are for development only. Never commit `.env` or real secrets.

### 2. Start the database and cache

```bash
docker compose up -d postgres redis
```

The supplied Compose configuration exposes PostgreSQL on **127.0.0.1:55432** and Redis on **6379**.

### 3. Apply database migrations

```bash
pnpm db:migrate
```

### 4. Start the application

```bash
pnpm dev
```

Open **http://localhost:3000**. The API health endpoint is **http://localhost:4000/health**.

> **Tip:** Run workspace commands from the repository root. If you change connection settings, ensure the API and migration process receive the same environment variables.

## Try the complete workflow

1. Register an **employer** account and create a company.
2. Create and publish a job with an optional minimum and maximum salary.
3. Register a separate **job seeker** account.
4. Search for the job, try the salary filters, save it, and apply.
5. Return to the employer account to review the applicant and update the application status.
6. Switch back to the job seeker account to view the application timeline and notifications.

## Development and verification

Run the API tests:

```bash
pnpm --filter @portal/api test
```

Build both applications:

```bash
pnpm build
```

Or build each independently:

```bash
pnpm --filter @portal/api build
pnpm --filter @portal/web build
```

**v1.0.0 verification:** 79 API tests passed; API and web production builds passed; the required GitHub Actions API CI check passed.

> Integration tests require the configured test database and supporting services. Use the repository's test configuration; do not point tests at a database containing valuable data.

## API overview

Selected endpoints (not an exhaustive API reference):

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness check |
| `GET` | `/ready` | Dependency readiness |
| `POST` | `/auth/register` | Create an account |
| `POST` | `/auth/login` | Sign in |
| `POST` | `/auth/logout` | Sign out |
| `GET` | `/auth/me` | Current session |
| `GET` | `/jobs` | Browse and filter jobs |
| `GET` | `/jobs/:id` | Job details |
| `POST` | `/companies` | Create a company |
| `POST` | `/jobs` | Create a job |
| `GET` | `/employer/jobs` | Employer job listings |
| `PATCH` | `/employer/jobs/:id/salary` | Edit or clear job salary |
| `POST` | `/jobs/:id/apply` | Apply for a job |
| `GET` | `/applications/mine` | Job seeker's applications |
| `GET` | `/applications/:id/timeline` | Application status history |
| `GET` | `/employer/jobs/:id/applications` | Employer's applicants |
| `PATCH` | `/employer/applications/:id` | Update application status |

### Job search example

```bash
curl "http://localhost:4000/jobs?q=engineer&minSalary=50000&maxSalary=120000&sort=newest&page=1"
```

`minSalary` and `maxSalary` are optional nonnegative integer filters. A request where the minimum exceeds the maximum is rejected. Salary figures have no enforced currency in this release; interpret them according to the job posting's context.

## Security and design notes

- Passwords are hashed with salted **scrypt**.
- Session tokens are random and stored as hashes in PostgreSQL.
- Database queries use parameterized `postgres.js` templates.
- Authentication, authorization, and resource ownership are enforced by the API.
- Cookies use `HttpOnly` and `SameSite=Lax`; the API also includes rate limiting and security headers.
- Public job-list responses are cached in Redis for approximately **20 seconds**, so newly published or edited jobs may take a short time to appear in search results.

**Scope:** This is a locally runnable v1.0 portfolio release, **not a claim of production hardening**. A public deployment would require additional operational and security review. Email delivery is not part of the project; alerts and notifications are in-app.

## Screenshots

Screenshots can be added later without deploying the application. Suggested captures:

- Job discovery and salary filters
- Employer dashboard and salary editor
- Applicant management
- Application status timeline
- Saved jobs and notifications

Store images in `docs/screenshots/` and reference them here when available.

## Release

**[CareerBridge v1.0.0](https://github.com/ysfhawarydev/careerbridge-job-portal/releases/tag/v1.0.0)** is the initial GitHub release, tagged from the protected `main` branch after PR #16 and passing CI.

## License

No license is declared here. If you want others to reuse or distribute the code, add a `LICENSE` file and update this section accordingly.

---

Built as a full-stack software engineering project, with an emphasis on end-to-end workflows, API security, automated testing, and maintainable architecture.
