import { config } from "dotenv";
import { fileURLToPath as envFileURLToPath } from "node:url";

config({ path: envFileURLToPath(new URL("../../../.env", import.meta.url)) });

import Fastify, { type FastifyRequest, type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import postgres from "postgres";
import { createClient } from "redis";
import { Redis } from "ioredis";
import { z, ZodError } from "zod";
import {
  randomBytes,
  createHash,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

import { isTrustedOrigin } from "./security.js";
import { loggerOptions } from "./logger.js";
import { checkReadiness } from "./readiness.js";
import { parseConfig } from "./config.js";
import { cleanupStartupResources } from "./startup-cleanup.js";

const scrypt = promisify(scryptCb);

export async function buildApp() {
  const env = parseConfig();
  const cleanup: Array<() => void | Promise<void>> = [];

  try {
    const db = postgres(env.DATABASE_URL, { max: 15 });
    cleanup.push(() => db.end({ timeout: 5 }));

    const redisUrl = env.REDIS_URL;
    const redis = createClient({ url: redisUrl });

    redis.on("error", (error) => {
      console.error("Redis:", error.message);
    });

    cleanup.push(async () => {
      if (redis.isOpen) {
        await redis.quit();
      } else {
        redis.disconnect();
      }
    });

    await redis.connect();

    const rateLimitRedis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });

    rateLimitRedis.on("error", (error: Error) => {
      console.error("Rate-limit Redis:", error.message);
    });

    cleanup.push(async () => {
      if (rateLimitRedis.status === "end") {
        return;
      }

      if (rateLimitRedis.status === "wait") {
        rateLimitRedis.disconnect();
        return;
      }

      await rateLimitRedis.quit();
    });

    await rateLimitRedis.connect();

    const app = Fastify({
      logger: loggerOptions,
      trustProxy: false,
    });

    // Keep every existing hook, plugin, helper, and route here.

    // Keep every existing hook, plugin, helper, and route here.

    app.addHook("onRequest", async (request, reply) => {
      reply.header("x-request-id", request.id);
    });

    await app.register(cors, {
      origin: env.WEB_ORIGIN,
      credentials: true,
      methods: ["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    });

    await app.register(cookie);
    await app.register(helmet);

    await app.register(rateLimit, {
      max: 100,
      timeWindow: "1 minute",
      redis: rateLimitRedis,
      nameSpace: env.RATE_LIMIT_NAMESPACE,
    });

    const allowedOrigin = env.WEB_ORIGIN;

    app.addHook("preHandler", async (req, reply) => {
      if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        return;
      }

      if (
        !isTrustedOrigin(req.headers.origin, req.headers.referer, allowedOrigin)
      ) {
        return reply.code(403).send({
          error: "Trusted origin required",
        });
      }
    });

    app.setErrorHandler((error: unknown, request, reply) => {
      const isError = error instanceof Error;

      const rawStatus =
        error !== null && typeof error === "object" && "statusCode" in error
          ? Number(error.statusCode)
          : 500;

      const status =
        error instanceof ZodError
          ? 400
          : Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599
            ? rawStatus
            : 500;

      const message =
        status >= 500
          ? "Internal server error"
          : isError
            ? error.message
            : "Request failed";

      if (status >= 500) {
        request.log.error({ err: error }, "Request failed");
      } else {
        request.log.warn({ err: error, status }, "Request rejected");
      }

      return reply.code(status).send({
        error: message,
        requestId: request.id,
      });
    });

    const hash = (value: string) =>
      createHash("sha256").update(value).digest("hex");

    async function passwordHash(password: string) {
      const salt = randomBytes(16).toString("hex");
      const key = (await scrypt(password, salt, 64)) as Buffer;

      return salt + ":" + key.toString("hex");
    }

    async function verify(password: string, stored: string) {
      const [salt, hex] = stored.split(":");

      if (!salt || !hex || hex.length !== 128) {
        return false;
      }

      const key = (await scrypt(password, salt, 64)) as Buffer;

      return timingSafeEqual(key, Buffer.from(hex, "hex"));
    }

    type User = {
      id: string;
      email: string;
      full_name: string;
      role: "seeker" | "employer" | "admin";
    };

    async function currentUser(req: FastifyRequest): Promise<User | null> {
      const token = req.cookies?.session;

      if (typeof token !== "string" || !token) {
        return null;
      }

      const rows = await db<User[]>`
        SELECT u.id, u.email, u.full_name, u.role
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ${hash(token)}
          AND s.expires_at > now()
        LIMIT 1
      `;

      return rows[0] ?? null;
    }

    async function requireUser(
      req: FastifyRequest,
      reply: FastifyReply,
      role?: User["role"],
    ) {
      const user = await currentUser(req);

      if (!user) {
        reply.code(401).send({
          error: "Authentication required",
        });

        return null;
      }

      if (role && user.role !== role) {
        reply.code(403).send({
          error: "Forbidden",
        });

        return null;
      }

      return user;
    }

    // --------------------------------------------------
    // Job alerts
    // --------------------------------------------------

    app.get("/job-alerts", async (req, reply) => {
      const user = await requireUser(req, reply, "seeker");

      if (!user) return;

      return db`
        SELECT
          id,
          keyword,
          location,
          type,
          is_active,
          created_at,
          updated_at
        FROM job_alerts
        WHERE user_id = ${user.id}
        ORDER BY created_at DESC
      `;
    });

    app.post("/job-alerts", async (req, reply) => {
      const user = await requireUser(req, reply, "seeker");

      if (!user) return;

      const data = z
        .object({
          keyword: z.string().trim().max(100).default(""),
          location: z.string().trim().max(100).default(""),
          type: z
            .enum(["full-time", "part-time", "contract", "internship"])
            .nullable()
            .optional(),
          isActive: z.boolean().default(true),
        })
        .refine(
          (value) =>
            value.keyword.length > 0 ||
            value.location.length > 0 ||
            value.type != null,
          {
            message: "Provide a keyword, location, or employment type",
          },
        )
        .parse(req.body);

      const rows = await db`
        INSERT INTO job_alerts (
          user_id,
          keyword,
          location,
          type,
          is_active
        )
        VALUES (
          ${user.id},
          ${data.keyword},
          ${data.location},
          ${data.type ?? null},
          ${data.isActive}
        )
        RETURNING *
      `;

      return reply.code(201).send(rows[0]);
    });

    app.patch("/job-alerts/:id", async (req, reply) => {
      const user = await requireUser(req, reply, "seeker");

      if (!user) return;

      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

      const data = z
        .object({
          keyword: z.string().trim().max(100).optional(),
          location: z.string().trim().max(100).optional(),
          type: z
            .enum(["full-time", "part-time", "contract", "internship"])
            .nullable()
            .optional(),
          isActive: z.boolean().optional(),
        })
        .refine((value) => Object.keys(value).length > 0, {
          message: "Provide at least one field to update",
        })
        .parse(req.body);

      const rows = await db`
        UPDATE job_alerts
        SET
          keyword = COALESCE(${data.keyword ?? null}, keyword),
          location = COALESCE(${data.location ?? null}, location),
          type = CASE
            WHEN ${data.type === undefined} THEN type
            ELSE ${data.type ?? null}
          END,
          is_active = COALESCE(${data.isActive ?? null}, is_active),
          updated_at = now()
        WHERE id = ${id}
          AND user_id = ${user.id}
        RETURNING *
      `;

      if (!rows.length) {
        return reply.code(404).send({
          error: "Job alert not found",
        });
      }

      return rows[0];
    });

    app.delete("/job-alerts/:id", async (req, reply) => {
      const user = await requireUser(req, reply, "seeker");

      if (!user) return;

      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

      const rows = await db`
        DELETE FROM job_alerts
        WHERE id = ${id}
          AND user_id = ${user.id}
        RETURNING id
      `;

      if (!rows.length) {
        return reply.code(404).send({
          error: "Job alert not found",
        });
      }

      return { ok: true };
    });

    // --------------------------------------------------
    // Notifications
    // --------------------------------------------------

    app.get("/notifications", async (req, reply) => {
      const user = await requireUser(req, reply, "seeker");

      if (!user) return;

      const query = z
        .object({
          unreadOnly: z.enum(["true", "false"]).default("false"),
          limit: z.coerce.number().int().min(1).max(100).default(30),
        })
        .parse(req.query);

      return db`
        SELECT
          n.id,
          n.job_id,
          n.kind,
          n.title,
          n.message,
          n.is_read,
          n.created_at,
          j.title AS job_title
        FROM notifications n
        LEFT JOIN jobs j ON j.id = n.job_id
        WHERE n.user_id = ${user.id}
          AND (
            ${query.unreadOnly === "false"}
            OR n.is_read = false
          )
        ORDER BY n.created_at DESC
        LIMIT ${query.limit}
      `;
    });

    app.patch("/notifications/:id/read", async (req, reply) => {
      const user = await requireUser(req, reply, "seeker");

      if (!user) return;

      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

      const rows = await db`
        UPDATE notifications
        SET is_read = true
        WHERE id = ${id}
          AND user_id = ${user.id}
        RETURNING id, is_read
      `;

      if (!rows.length) {
        return reply.code(404).send({
          error: "Notification not found",
        });
      }

      return rows[0];
    });

    app.patch("/notifications/read-all", async (req, reply) => {
      const user = await requireUser(req, reply, "seeker");

      if (!user) return;

      const rows = await db`
        UPDATE notifications
        SET is_read = true
        WHERE user_id = ${user.id}
          AND is_read = false
        RETURNING id
      `;

      return {
        ok: true,
        updated: rows.length,
      };
    });

    async function notifyMatchingAlerts(jobId: string) {
      await db`
        INSERT INTO notifications (
          user_id,
          job_id,
          kind,
          title,
          message
        )
        SELECT DISTINCT
          a.user_id,
          j.id,
          'job_match',
          'New job match: ' || j.title,
          c.name || ' · ' || j.location
        FROM job_alerts a
        JOIN jobs j ON j.status = 'published'
        JOIN companies c ON c.id = j.company_id
        WHERE j.id = ${jobId}
          AND a.is_active = true
        ON CONFLICT (user_id, job_id, kind)
          WHERE job_id IS NOT NULL
        DO NOTHING
      `;
    }

    async function newSession(userId: string, reply: FastifyReply) {
      const token = randomBytes(32).toString("hex");

      await db`
        INSERT INTO sessions(user_id, token_hash, expires_at)
        VALUES (
          ${userId},
          ${hash(token)},
          now() + interval '7 days'
        )
      `;

      reply.setCookie("session", token, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 604800,
      });
    }

    const credentials = z.object({
      email: z
        .string()
        .email()
        .max(255)
        .transform((value) => value.toLowerCase()),
      password: z.string().min(8).max(128),
    });

    // --------------------------------------------------
    // Authentication
    // --------------------------------------------------

    app.post(
      "/auth/register",
      {
        config: {
          rateLimit: {
            max: 10,
            timeWindow: "1 minute",
          },
        },
      },
      async (req, reply) => {
        const data = credentials
          .extend({
            fullName: z.string().min(2).max(120),
            role: z.enum(["seeker", "employer"]),
          })
          .parse(req.body);

        const pwd = await passwordHash(data.password);

        const rows = await db`
          INSERT INTO users(
            email,
            password_hash,
            full_name,
            role
          )
          VALUES (
            ${data.email},
            ${pwd},
            ${data.fullName},
            ${data.role}
          )
          ON CONFLICT(email) DO NOTHING
          RETURNING id, email, full_name, role
        `;

        if (!rows.length) {
          return reply.code(409).send({
            error: "Email already registered",
          });
        }

        await newSession(rows[0].id, reply);

        return { user: rows[0] };
      },
    );

    app.post(
      "/auth/login",
      {
        config: {
          rateLimit: {
            max: 10,
            timeWindow: "1 minute",
          },
        },
      },
      async (req, reply) => {
        const data = credentials.parse(req.body);

        const rows = await db`
          SELECT
            id,
            email,
            full_name,
            role,
            password_hash
          FROM users
          WHERE email = ${data.email}
          LIMIT 1
        `;

        if (
          !rows.length ||
          !(await verify(data.password, rows[0].password_hash))
        ) {
          return reply.code(401).send({
            error: "Invalid credentials",
          });
        }

        const previousToken = req.cookies.session;

        if (previousToken) {
          await db`
            DELETE FROM sessions
            WHERE token_hash = ${hash(previousToken)}
          `;
        }

        await newSession(rows[0].id, reply);

        const { password_hash, ...user } = rows[0];

        return { user };
      },
    );

    app.post("/auth/logout", async (req, reply) => {
      const token = req.cookies.session;

      if (token) {
        await db`
          DELETE FROM sessions
          WHERE token_hash = ${hash(token)}
        `;
      }

      reply.clearCookie("session", {
        path: "/",
      });

      return { ok: true };
    });

    app.get("/auth/me", async (req) => ({
      user: await currentUser(req),
    }));

    // --------------------------------------------------
    // Health and readiness
    // --------------------------------------------------

    app.get("/health", async () => ({
      ok: true,
    }));

    app.get("/ready", async (_request, reply) => {
      const result = await checkReadiness(
        () => db`SELECT 1`,
        () => redis.ping(),
        {
          timeoutMs: env.READINESS_TIMEOUT_MS,
        },
      );

      return reply.code(result.ok ? 200 : 503).send(result);
    });

    // --------------------------------------------------
    // Public jobs
    // --------------------------------------------------

    app.get("/jobs", async (req) => {
      const query = z
        .object({
          q: z.string().max(100).optional(),
          location: z.string().max(100).optional(),
          type: z
            .enum(["full-time", "part-time", "contract", "internship"])
            .optional(),
          sort: z
            .enum(["newest", "salary-asc", "salary-desc"])
            .default("newest"),
          minSalary: z.coerce.number().int().min(0).max(2147483647).optional(),
          maxSalary: z.coerce.number().int().min(0).max(2147483647).optional(),
          limit: z.coerce.number().int().min(1).max(50).default(12),
          page: z.coerce.number().int().min(1).max(10000).default(1),
        })
        .refine(
          (query) =>
            query.minSalary === undefined ||
            query.maxSalary === undefined ||
            query.minSalary <= query.maxSalary,
          {
            message: "Minimum salary cannot exceed maximum salary",
            path: ["maxSalary"],
          },
        )
        .parse(req.query);

      const offset = (query.page - 1) * query.limit;
      const q = query.q?.trim() ?? "";
      const loc = query.location?.trim() ?? "";
      const type = query.type ?? "";
      const minSalary = query.minSalary ?? null;
      const maxSalary = query.maxSalary ?? null;

      const key =
        "jobs:" +
        hash(
          JSON.stringify({
            q,
            loc,
            type,
            minSalary,
            maxSalary,
            sort: query.sort,
            offset,
            limit: query.limit,
          }),
        );

      const cached = await redis.get(key);

      if (cached) {
        return JSON.parse(cached);
      }

      const rows = await db`
        SELECT
          j.id,
          j.title,
          j.description,
          j.location,
          j.type,
          j.salary_min,
          j.salary_max,
          j.created_at,
          c.name AS company_name
        FROM jobs j
        JOIN companies c ON c.id = j.company_id
        WHERE j.status = 'published'
          AND (
            ${q} = ''
            OR to_tsvector(
              'english',
              j.title || ' ' || j.description
            ) @@ plainto_tsquery('english', ${q})
          )
          AND (
            ${loc} = ''
            OR j.location ILIKE ${"%" + loc + "%"}
          )
          AND (
            ${type} = ''
            OR j.type = ${type}
          )
          AND (
            ${minSalary}::integer IS NULL
            OR COALESCE(j.salary_max, j.salary_min) >= ${minSalary}
          )
          AND (
            ${maxSalary}::integer IS NULL
            OR COALESCE(j.salary_min, j.salary_max) <= ${maxSalary}
          )
        ORDER BY
          CASE
            WHEN ${query.sort} = 'salary-asc'
            THEN j.salary_min
          END ASC NULLS LAST,
          CASE
            WHEN ${query.sort} = 'salary-desc'
            THEN j.salary_max
          END DESC NULLS LAST,
          j.created_at DESC,
          j.id DESC
        LIMIT ${query.limit + 1}
        OFFSET ${offset}
      `;

      const hasMore = rows.length > query.limit;
      const jobs = rows.slice(0, query.limit);

      const result = {
        jobs,
        page: query.page,
        limit: query.limit,
        hasMore,
      };

      await redis.set(key, JSON.stringify(result), {
        EX: 20,
      });

      return result;
    });

    app.get("/jobs/:id", async (req, reply) => {
      const { id } = z
        .object({
          id: z.string().uuid(),
        })
        .parse(req.params);

      const rows = await db`
        SELECT j.*, c.name AS company_name
        FROM jobs j
        JOIN companies c ON c.id = j.company_id
        WHERE j.id = ${id}
          AND j.status = 'published'
      `;

      return (
        rows[0] ??
        reply.code(404).send({
          error: "Job not found",
        })
      );
    });

    // --------------------------------------------------
    // Companies
    // --------------------------------------------------

    app.post("/companies", async (req, reply) => {
      const user = await requireUser(req, reply, "employer");

      if (!user) return;

      const data = z
        .object({
          name: z.string().min(2).max(150),
          description: z.string().max(5000).default(""),
        })
        .parse(req.body);

      const rows = await db`
        INSERT INTO companies(
          name,
          description,
          owner_id
        )
        VALUES (
          ${data.name},
          ${data.description},
          ${user.id}
        )
        RETURNING *
      `;

      return reply.code(201).send(rows[0]);
    });

    app.get("/companies/mine", async (req, reply) => {
      const user = await requireUser(req, reply, "employer");

      if (!user) return;

      return db`
        SELECT *
        FROM companies
        WHERE owner_id = ${user.id}
        ORDER BY created_at DESC
      `;
    });

    // --------------------------------------------------
    // Employer jobs
    // --------------------------------------------------

    app.post("/jobs", async (req, reply) => {
      const user = await requireUser(req, reply, "employer");

      if (!user) return;

      const data = z
        .object({
          companyId: z.string().uuid(),
          title: z.string().min(3).max(200),
          description: z.string().min(20).max(20000),
          location: z.string().min(2).max(150),
          type: z.enum(["full-time", "part-time", "contract", "internship"]),
          salaryMin: z.number().int().nonnegative().nullable().optional(),
          salaryMax: z.number().int().nonnegative().nullable().optional(),
        })
        .refine(
          (value) =>
            value.salaryMin == null ||
            value.salaryMax == null ||
            value.salaryMin <= value.salaryMax,
          {
            message: "Invalid salary range",
          },
        )
        .parse(req.body);

      const rows = await db`
        INSERT INTO jobs(
          company_id,
          title,
          description,
          location,
          type,
          salary_min,
          salary_max
        )
        SELECT
          id,
          ${data.title},
          ${data.description},
          ${data.location},
          ${data.type},
          ${data.salaryMin ?? null},
          ${data.salaryMax ?? null}
        FROM companies
        WHERE id = ${data.companyId}
          AND owner_id = ${user.id}
        RETURNING *
      `;

      if (!rows.length) {
        return reply.code(403).send({
          error: "Company not owned by you",
        });
      }

      await notifyMatchingAlerts(rows[0].id);

      return reply.code(201).send(rows[0]);
    });

    app.get("/employer/jobs", async (req, reply) => {
      const user = await requireUser(req, reply, "employer");

      if (!user) return;

      return db`
        SELECT
          j.*,
          c.name AS company_name,
          (
            SELECT count(*)::int
            FROM applications a
            WHERE a.job_id = j.id
          ) AS applicants
        FROM jobs j
        JOIN companies c ON c.id = j.company_id
        WHERE c.owner_id = ${user.id}
        ORDER BY j.created_at DESC
      `;
    });

    // --------------------------------------------------
    // Applications
    // --------------------------------------------------

    app.post("/jobs/:id/apply", async (req, reply) => {
      const user = await requireUser(req, reply, "seeker");

      if (!user) return;

      const { id } = z
        .object({
          id: z.string().uuid(),
        })
        .parse(req.params);

      const { coverLetter } = z
        .object({
          coverLetter: z.string().max(5000).default(""),
        })
        .parse(req.body);

      const rows = await db`
        INSERT INTO applications(
          job_id,
          seeker_id,
          cover_letter
        )
        SELECT
          id,
          ${user.id},
          ${coverLetter}
        FROM jobs
        WHERE id = ${id}
          AND status = 'published'
        ON CONFLICT(job_id, seeker_id) DO NOTHING
        RETURNING *
      `;

      if (!rows.length) {
        return reply.code(409).send({
          error: "Job unavailable or already applied",
        });
      }

      await db`
        INSERT INTO application_status_history (
          application_id,
          status,
          changed_by,
          note
        )
        VALUES (
          ${rows[0].id},
          'submitted',
          ${user.id},
          'Application submitted'
        )
      `;

      return reply.code(201).send(rows[0]);
    });

    app.get("/applications/mine", async (req, reply) => {
      const user = await requireUser(req, reply, "seeker");

      if (!user) return;

      return db`
        SELECT
          a.id,
          a.status,
          a.created_at,
          j.title,
          j.location,
          c.name AS company_name
        FROM applications a
        JOIN jobs j ON j.id = a.job_id
        JOIN companies c ON c.id = j.company_id
        WHERE a.seeker_id = ${user.id}
        ORDER BY a.created_at DESC
      `;
    });

    app.get("/employer/jobs/:id/applications", async (req, reply) => {
      const user = await requireUser(req, reply, "employer");

      if (!user) return;

      const { id } = z
        .object({
          id: z.string().uuid(),
        })
        .parse(req.params);

      return db`
        SELECT
          a.id,
          a.status,
          a.cover_letter,
          a.created_at,
          u.full_name,
          u.email
        FROM applications a
        JOIN users u ON u.id = a.seeker_id
        JOIN jobs j ON j.id = a.job_id
        JOIN companies c ON c.id = j.company_id
        WHERE j.id = ${id}
          AND c.owner_id = ${user.id}
        ORDER BY a.created_at DESC
      `;
    });

    // --------------------------------------------------
    // Application tracking timeline
    // --------------------------------------------------

    app.get("/applications/:id/timeline", async (req, reply) => {
      const user = await requireUser(req, reply);

      if (!user) return;

      const { id } = z
        .object({
          id: z.string().uuid(),
        })
        .parse(req.params);

      const rows = await db`
        SELECT
          h.id,
          h.application_id,
          h.status,
          h.note,
          h.created_at,
          u.full_name AS changed_by_name
        FROM application_status_history h
        JOIN applications a ON a.id = h.application_id
        LEFT JOIN jobs j ON j.id = a.job_id
        LEFT JOIN companies c ON c.id = j.company_id
        LEFT JOIN users u ON u.id = h.changed_by
        WHERE h.application_id = ${id}
          AND (
            a.seeker_id = ${user.id}
            OR c.owner_id = ${user.id}
          )
        ORDER BY h.created_at ASC, h.id ASC
      `;

      if (!rows.length) {
        return reply.code(404).send({
          error: "Application not found or timeline unavailable",
        });
      }

      return rows;
    });

    app.patch("/employer/applications/:id", async (req, reply) => {
      const user = await requireUser(req, reply, "employer");

      if (!user) return;

      const { id } = z
        .object({
          id: z.string().uuid(),
        })
        .parse(req.params);

      const { status } = z
        .object({
          status: z.enum(["reviewing", "shortlisted", "rejected", "hired"]),
        })
        .parse(req.body);

      const result = await db.begin(async (tx) => {
        const applications = await tx`
      SELECT
        a.id,
        a.status
      FROM applications a
      JOIN jobs j ON j.id = a.job_id
      JOIN companies c ON c.id = j.company_id
      WHERE a.id = ${id}
        AND c.owner_id = ${user.id}
      FOR UPDATE OF a
    `;

        if (!applications.length) {
          return { notFound: true as const };
        }

        const application = applications[0];

        if (application.status === status) {
          return {
            notFound: false as const,
            application,
            changed: false,
          };
        }

        const updated = await tx`
      UPDATE applications
      SET status = ${status}
      WHERE id = ${id}
      RETURNING *
    `;

        await tx`
      INSERT INTO application_status_history (
        application_id,
        status,
        changed_by,
        note
      )
      VALUES (
        ${id},
        ${status},
        ${user.id},
        ${"Status changed from " + application.status + " to " + status}
      )
    `;

        return {
          notFound: false as const,
          application: updated[0],
          changed: true,
        };
      });

      if (result.notFound) {
        return reply.code(404).send({
          error: "Application not found",
        });
      }

      return result.application;
    });

    // --------------------------------------------------
    // Job seeker profile
    // --------------------------------------------------

    app.patch("/profile", async (req, reply) => {
      const user = await requireUser(req, reply, "seeker");

      if (!user) return;

      const data = z
        .object({
          fullName: z.string().trim().min(2).max(120),
          headline: z.string().trim().max(180).default(""),
          location: z.string().trim().max(150).default(""),
          bio: z.string().trim().max(3000).default(""),
        })
        .parse(req.body);

      const rows = await db`
        UPDATE users
        SET
          full_name = ${data.fullName},
          headline = ${data.headline},
          location = ${data.location},
          bio = ${data.bio}
        WHERE id = ${user.id}
        RETURNING
          id,
          email,
          full_name,
          role,
          headline,
          location,
          bio
      `;

      return rows[0];
    });

    app.get("/profile", async (req, reply) => {
      const user = await requireUser(req, reply, "seeker");

      if (!user) return;

      const rows = await db`
        SELECT
          id,
          email,
          full_name,
          role,
          headline,
          location,
          bio
        FROM users
        WHERE id = ${user.id}
      `;

      return rows[0];
    });

    // --------------------------------------------------
    // Saved jobs
    // --------------------------------------------------

    app.get("/saved-jobs", async (req, reply) => {
      const user = await requireUser(req, reply, "seeker");

      if (!user) return;

      return db`
        SELECT
          j.id,
          j.title,
          j.description,
          j.location,
          j.type,
          j.salary_min,
          j.salary_max,
          j.created_at,
          c.name AS company_name
        FROM saved_jobs s
        JOIN jobs j ON j.id = s.job_id
        JOIN companies c ON c.id = j.company_id
        WHERE s.user_id = ${user.id}
          AND j.status = 'published'
        ORDER BY j.created_at DESC
      `;
    });

    app.put("/saved-jobs/:id", async (req, reply) => {
      const user = await requireUser(req, reply, "seeker");

      if (!user) return;

      const { id } = z
        .object({
          id: z.string().uuid(),
        })
        .parse(req.params);

      const rows = await db`
        INSERT INTO saved_jobs(user_id, job_id)
        SELECT
          ${user.id},
          id
        FROM jobs
        WHERE id = ${id}
          AND status = 'published'
        ON CONFLICT DO NOTHING
        RETURNING job_id
      `;

      if (!rows.length) {
        const existing = await db`
          SELECT 1
          FROM saved_jobs s
          JOIN jobs j ON j.id = s.job_id
          WHERE s.user_id = ${user.id}
            AND s.job_id = ${id}
            AND j.status = 'published'
        `;

        if (!existing.length) {
          return reply.code(404).send({
            error: "Job not found",
          });
        }
      }

      return { ok: true };
    });

    app.delete("/saved-jobs/:id", async (req, reply) => {
      const user = await requireUser(req, reply, "seeker");

      if (!user) return;

      const { id } = z
        .object({
          id: z.string().uuid(),
        })
        .parse(req.params);

      await db`
        DELETE FROM saved_jobs
        WHERE user_id = ${user.id}
          AND job_id = ${id}
      `;

      return { ok: true };
    });

    // --------------------------------------------------
    // Employer job status
    // --------------------------------------------------

    app.patch("/employer/jobs/:id", async (req, reply) => {
      const user = await requireUser(req, reply, "employer");

      if (!user) return;

      const { id } = z
        .object({
          id: z.string().uuid(),
        })
        .parse(req.params);

      const { status } = z
        .object({
          status: z.enum(["draft", "published", "closed"]),
        })
        .parse(req.body);

      const rows = await db`
        UPDATE jobs j
        SET status = ${status}
        FROM companies c
        WHERE j.id = ${id}
          AND c.id = j.company_id
          AND c.owner_id = ${user.id}
        RETURNING j.*
      `;

      if (!rows.length) {
        return reply.code(404).send({
          error: "Job not found",
        });
      }

      return rows[0];
    });

    // --------------------------------------------------
    // Employer job salary
    // --------------------------------------------------

    app.patch("/employer/jobs/:id/salary", async (req, reply) => {
      const user = await requireUser(req, reply, "employer");

      if (!user) return;

      const { id } = z
        .object({
          id: z.string().uuid(),
        })
        .parse(req.params);

      const { salaryMin, salaryMax } = z
        .object({
          salaryMin: z.number().int().min(0).max(2147483647).nullable(),
          salaryMax: z.number().int().min(0).max(2147483647).nullable(),
        })
        .refine(
          (data) =>
            data.salaryMin === null ||
            data.salaryMax === null ||
            data.salaryMin <= data.salaryMax,
          {
            message: "Minimum salary cannot exceed maximum salary",
            path: ["salaryMax"],
          },
        )
        .parse(req.body);

      const rows = await db`
    UPDATE jobs j
    SET
      salary_min = ${salaryMin},
      salary_max = ${salaryMax}
    FROM companies c
    WHERE j.id = ${id}
      AND c.id = j.company_id
      AND c.owner_id = ${user.id}
    RETURNING j.*
  `;

      if (!rows.length) {
        return reply.code(404).send({
          error: "Job not found",
        });
      }

      return rows[0];
    });

    // --------------------------------------------------
    // Graceful shutdown
    // --------------------------------------------------

    app.addHook("onClose", async () => {
      await cleanupStartupResources(cleanup);
      cleanup.length = 0;
    });

    return app;
  } catch (startupError) {
    try {
      await cleanupStartupResources(cleanup);
    } catch (cleanupError) {
      console.error("API startup cleanup failed:", cleanupError);
    }

    throw startupError;
  }
}
