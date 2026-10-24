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
import { z, ZodError } from "zod";
import {
  randomBytes,
  createHash,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { isTrustedOrigin } from "./security.js";

const scrypt = promisify(scryptCb);
const db = postgres(
  process.env.DATABASE_URL ?? "postgres://portal:portal@localhost:5432/portal",
  { max: 15 },
);
const redis = createClient({
  url: process.env.REDIS_URL ?? "redis://localhost:6379",
});
redis.on("error", (e) => console.error("Redis:", e.message));

export async function buildApp() {
  await redis.connect();
  const app = Fastify({ logger: true, trustProxy: false });
await app.register(cors, {
  origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
  credentials: true,
});
await app.register(cookie);
await app.register(helmet);
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

const allowedOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

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
    Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599
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
  });
});

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return salt + ":" + key.toString("hex");
}
async function verify(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex || hex.length !== 128) return false;
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
  if (typeof token !== "string" || !token) return null;
  const rows = await db<
    User[]
  >`SELECT u.id,u.email,u.full_name,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=${hash(token)} AND s.expires_at>now() LIMIT 1`;
  return rows[0] ?? null;
}
async function requireUser(
  req: FastifyRequest,
  reply: FastifyReply,
  role?: User["role"],
) {
  const user = await currentUser(req);
  if (!user) {
    reply.code(401).send({ error: "Authentication required" });
    return null;
  }
  if (role && user.role !== role) {
    reply.code(403).send({ error: "Forbidden" });
    return null;
  }
  return user;
}
async function newSession(userId: string, reply: FastifyReply) {
  const token = randomBytes(32).toString("hex");
  await db`INSERT INTO sessions(user_id,token_hash,expires_at) VALUES(${userId},${hash(token)},now()+interval '7 days')`;
  reply.setCookie("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
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
    .transform((x) => x.toLowerCase()),
  password: z.string().min(8).max(128),
});
app.post(
  "/auth/register",
  { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
  async (req, reply) => {
    const data = credentials
      .extend({
        fullName: z.string().min(2).max(120),
        role: z.enum(["seeker", "employer"]),
      })
      .parse(req.body);
    const pwd = await passwordHash(data.password);
    const rows =
      await db`INSERT INTO users(email,password_hash,full_name,role) VALUES(${data.email},${pwd},${data.fullName},${data.role}) ON CONFLICT(email) DO NOTHING RETURNING id,email,full_name,role`;
    if (!rows.length)
      return reply.code(409).send({ error: "Email already registered" });
    await newSession(rows[0].id, reply);
    return { user: rows[0] };
  },
);
app.post(
  "/auth/login",
  { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
  async (req, reply) => {
    const data = credentials.parse(req.body);
    const rows =
      await db`SELECT id,email,full_name,role,password_hash FROM users WHERE email=${data.email} LIMIT 1`;
    if (!rows.length || !(await verify(data.password, rows[0].password_hash)))
      return reply.code(401).send({ error: "Invalid credentials" });
    const previousToken = req.cookies.session;
    if (previousToken)
      await db`DELETE FROM sessions WHERE token_hash=${hash(previousToken)}`;
    await newSession(rows[0].id, reply);
    const { password_hash, ...user } = rows[0];
    return { user };
  },
);
app.post("/auth/logout", async (req, reply) => {
  const token = req.cookies.session;
  if (token) await db`DELETE FROM sessions WHERE token_hash=${hash(token)}`;
  reply.clearCookie("session", { path: "/" });
  return { ok: true };
});
app.get("/auth/me", async (req) => ({ user: await currentUser(req) }));
app.get("/health", async () => ({ ok: true }));
app.get("/jobs", async (req) => {
  const query = z
    .object({
      q: z.string().max(100).optional(),
      location: z.string().max(100).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(12),
      page: z.coerce.number().int().min(1).max(10000).default(1),
    })
    .parse(req.query);
  const offset = (query.page - 1) * query.limit;
  const q = query.q?.trim() ?? "";
  const loc = query.location?.trim() ?? "";
  const key =
    "jobs:" + hash(JSON.stringify({ q, loc, offset, limit: query.limit }));
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  const jobs = await db`
    SELECT j.id,j.title,j.description,j.location,j.type,j.salary_min,j.salary_max,j.created_at,c.name AS company_name
    FROM jobs j JOIN companies c ON c.id=j.company_id
    WHERE j.status='published'
    AND (${q}='' OR to_tsvector('english',j.title || ' ' || j.description) @@ plainto_tsquery('english',${q}))
    AND (${loc}='' OR j.location ILIKE ${"%" + loc + "%"})
    ORDER BY j.created_at DESC,j.id DESC LIMIT ${query.limit} OFFSET ${offset}`;
  const result = { jobs, page: query.page };
  await redis.set(key, JSON.stringify(result), { EX: 20 });
  return result;
});
app.get("/jobs/:id", async (req, reply) => {
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const rows =
    await db`SELECT j.*,c.name AS company_name FROM jobs j JOIN companies c ON c.id=j.company_id WHERE j.id=${id} AND j.status='published'`;
  return rows[0] ?? reply.code(404).send({ error: "Job not found" });
});
app.post("/companies", async (req, reply) => {
  const user = await requireUser(req, reply, "employer");
  if (!user) return;
  const data = z
    .object({
      name: z.string().min(2).max(150),
      description: z.string().max(5000).default(""),
    })
    .parse(req.body);
  const rows =
    await db`INSERT INTO companies(name,description,owner_id) VALUES(${data.name},${data.description},${user.id}) RETURNING *`;
  return reply.code(201).send(rows[0]);
});
app.get("/companies/mine", async (req, reply) => {
  const user = await requireUser(req, reply, "employer");
  if (!user) return;
  return db`SELECT * FROM companies WHERE owner_id=${user.id} ORDER BY created_at DESC`;
});
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
      (x) =>
        x.salaryMin == null ||
        x.salaryMax == null ||
        x.salaryMin <= x.salaryMax,
      { message: "Invalid salary range" },
    )
    .parse(req.body);
  const rows =
    await db`INSERT INTO jobs(company_id,title,description,location,type,salary_min,salary_max)
    SELECT id,${data.title},${data.description},${data.location},${data.type},${data.salaryMin ?? null},${data.salaryMax ?? null}
    FROM companies WHERE id=${data.companyId} AND owner_id=${user.id} RETURNING *`;
  if (!rows.length)
    return reply.code(403).send({ error: "Company not owned by you" });
  return reply.code(201).send(rows[0]);
});
app.get("/employer/jobs", async (req, reply) => {
  const user = await requireUser(req, reply, "employer");
  if (!user) return;
  return db`SELECT j.*,c.name AS company_name,(SELECT count(*)::int FROM applications a WHERE a.job_id=j.id) AS applicants
    FROM jobs j JOIN companies c ON c.id=j.company_id WHERE c.owner_id=${user.id} ORDER BY j.created_at DESC`;
});
app.post("/jobs/:id/apply", async (req, reply) => {
  const user = await requireUser(req, reply, "seeker");
  if (!user) return;
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { coverLetter } = z
    .object({ coverLetter: z.string().max(5000).default("") })
    .parse(req.body);
  const rows = await db`INSERT INTO applications(job_id,seeker_id,cover_letter)
    SELECT id,${user.id},${coverLetter} FROM jobs WHERE id=${id} AND status='published'
    ON CONFLICT(job_id,seeker_id) DO NOTHING RETURNING *`;
  if (!rows.length)
    return reply
      .code(409)
      .send({ error: "Job unavailable or already applied" });
  return reply.code(201).send(rows[0]);
});
app.get("/applications/mine", async (req, reply) => {
  const user = await requireUser(req, reply, "seeker");
  if (!user) return;
  return db`SELECT a.id,a.status,a.created_at,j.title,j.location,c.name AS company_name
    FROM applications a JOIN jobs j ON j.id=a.job_id JOIN companies c ON c.id=j.company_id
    WHERE a.seeker_id=${user.id} ORDER BY a.created_at DESC`;
});
app.get("/employer/jobs/:id/applications", async (req, reply) => {
  const user = await requireUser(req, reply, "employer");
  if (!user) return;
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  return db`SELECT a.id,a.status,a.cover_letter,a.created_at,u.full_name,u.email
    FROM applications a JOIN users u ON u.id=a.seeker_id JOIN jobs j ON j.id=a.job_id
    JOIN companies c ON c.id=j.company_id WHERE j.id=${id} AND c.owner_id=${user.id}
    ORDER BY a.created_at DESC`;
});
app.patch("/employer/applications/:id", async (req, reply) => {
  const user = await requireUser(req, reply, "employer");
  if (!user) return;
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { status } = z
    .object({
      status: z.enum(["reviewing", "shortlisted", "rejected", "hired"]),
    })
    .parse(req.body);
  const rows = await db`UPDATE applications a SET status=${status}
    FROM jobs j JOIN companies c ON c.id=j.company_id
    WHERE a.id=${id} AND a.job_id=j.id AND c.owner_id=${user.id} RETURNING a.*`;
  return rows[0] ?? reply.code(404).send({ error: "Application not found" });
});
// Job seeker profile.
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
  const rows = await db`UPDATE users SET full_name=${data.fullName},
    headline=${data.headline}, location=${data.location}, bio=${data.bio}
    WHERE id=${user.id} RETURNING id,email,full_name,role,headline,location,bio`;
  return rows[0];
});
app.get("/profile", async (req, reply) => {
  const user = await requireUser(req, reply, "seeker");
  if (!user) return;
  const rows = await db`SELECT id,email,full_name,role,headline,location,bio
    FROM users WHERE id=${user.id}`;
  return rows[0];
});
app.get("/saved-jobs", async (req, reply) => {
  const user = await requireUser(req, reply, "seeker");
  if (!user) return;
  return db`SELECT j.id,j.title,j.description,j.location,j.type,j.salary_min,j.salary_max,
    j.created_at,c.name AS company_name
    FROM saved_jobs s JOIN jobs j ON j.id=s.job_id
    JOIN companies c ON c.id=j.company_id
    WHERE s.user_id=${user.id} AND j.status='published'
    ORDER BY j.created_at DESC`;
});
app.put("/saved-jobs/:id", async (req, reply) => {
  const user = await requireUser(req, reply, "seeker");
  if (!user) return;
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const rows = await db`INSERT INTO saved_jobs(user_id,job_id)
    SELECT ${user.id},id FROM jobs WHERE id=${id} AND status='published'
    ON CONFLICT DO NOTHING RETURNING job_id`;
  if (!rows.length) {
    const existing =
      await db`SELECT 1 FROM saved_jobs s JOIN jobs j ON j.id=s.job_id
      WHERE s.user_id=${user.id} AND s.job_id=${id} AND j.status='published'`;
    if (!existing.length)
      return reply.code(404).send({ error: "Job not found" });
  }
  return { ok: true };
});
app.delete("/saved-jobs/:id", async (req, reply) => {
  const user = await requireUser(req, reply, "seeker");
  if (!user) return;
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  await db`DELETE FROM saved_jobs WHERE user_id=${user.id} AND job_id=${id}`;
  return { ok: true };
});
app.patch("/employer/jobs/:id", async (req, reply) => {
  const user = await requireUser(req, reply, "employer");
  if (!user) return;
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  const { status } = z
    .object({
      status: z.enum(["draft", "published", "closed"]),
    })
    .parse(req.body);
  const rows = await db`UPDATE jobs j SET status=${status}
    FROM companies c WHERE j.id=${id} AND c.id=j.company_id
    AND c.owner_id=${user.id} RETURNING j.*`;
  if (!rows.length) return reply.code(404).send({ error: "Job not found" });
  return rows[0];
});
app.addHook("onClose", async () => {
  await redis.quit();
  await db.end();
});

  return app;
}
