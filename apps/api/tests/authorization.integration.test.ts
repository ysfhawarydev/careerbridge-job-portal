import "./test-env.js";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { assertTestDatabase } from "./assert-test-db.js";

const origin = "http://localhost:3000";
const password = "TestPassword123!";

let app: FastifyInstance;

type TestAccount = {
  cookie: string;
  id: string;
};

type TimelineEntry = {
  id: string;
  application_id: string;
  status: string;
  note: string;
  created_at: string;
  changed_by_name: string | null;
};

let employerA: TestAccount;
let employerB: TestAccount;
let seeker: TestAccount;
let seekerB: TestAccount;

let companyId: string;
let jobId: string;
let applicationId: string;

async function register(role: "seeker" | "employer"): Promise<TestAccount> {
  const response = await app.inject({
    method: "POST",
    url: "/auth/register",
    headers: { origin },
    payload: {
      email: `${role}-${randomUUID()}@example.test`,
      password,
      fullName: `Test ${role}`,
      role,
    },
  });

  expect(response.statusCode).toBe(200);

  const setCookie = response.headers["set-cookie"];
  expect(setCookie).toBeDefined();

  const cookie = (
    Array.isArray(setCookie) ? setCookie[0] : String(setCookie)
  ).split(";")[0];

  return {
    cookie,
    id: response.json().user.id,
  };
}

async function getTimeline(cookie: string, id = applicationId) {
  return app.inject({
    method: "GET",
    url: `/applications/${id}/timeline`,
    headers: { cookie },
  });
}

beforeAll(async () => {
  await assertTestDatabase();

  const { buildApp } = await import("../src/app.js");

  app = await buildApp();
  await app.ready();

  employerA = await register("employer");
  employerB = await register("employer");
  seeker = await register("seeker");
  seekerB = await register("seeker");

  const company = await app.inject({
    method: "POST",
    url: "/companies",
    headers: {
      origin,
      cookie: employerA.cookie,
    },
    payload: {
      name: `Test Company ${randomUUID()}`,
      description: "Integration test company",
    },
  });

  expect(company.statusCode).toBe(201);
  companyId = company.json().id;

  const job = await app.inject({
    method: "POST",
    url: "/jobs",
    headers: {
      origin,
      cookie: employerA.cookie,
    },
    payload: {
      companyId,
      title: "Integration Test Engineer",
      description:
        "A test engineering position created for authorization integration tests.",
      location: "Remote",
      type: "full-time",
      salaryMin: 50000,
      salaryMax: 90000,
    },
  });

  expect(job.statusCode).toBe(201);
  jobId = job.json().id;

  const publish = await app.inject({
    method: "PATCH",
    url: `/employer/jobs/${jobId}`,
    headers: {
      origin,
      cookie: employerA.cookie,
    },
    payload: { status: "published" },
  });

  expect(publish.statusCode).toBe(200);
}, 30000);

afterAll(async () => {
  if (app) await app.close();
});

describe("CareerBridge authorization and ownership", () => {
  it("prevents Employer B from changing Employer A's job", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/employer/jobs/${jobId}`,
      headers: {
        origin,
        cookie: employerB.cookie,
      },
      payload: { status: "closed" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("prevents Employer B from creating jobs for Employer A's company", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/jobs",
      headers: {
        origin,
        cookie: employerB.cookie,
      },
      payload: {
        companyId,
        title: "Unauthorized Engineering Job",
        description:
          "This job must not be created because the company belongs to another employer.",
        location: "Remote",
        type: "full-time",
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("allows a seeker to apply to a published job", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/jobs/${jobId}/apply`,
      headers: {
        origin,
        cookie: seeker.cookie,
      },
      payload: {
        coverLetter: "I would like to apply for this position.",
      },
    });

    expect(response.statusCode).toBe(201);

    applicationId = response.json().id;
    expect(applicationId).toBeDefined();
  });

  it("prevents Employer B from viewing Employer A's applicants", async () => {
    expect(applicationId).toBeDefined();

    const ownerResponse = await app.inject({
      method: "GET",
      url: `/employer/jobs/${jobId}/applications`,
      headers: {
        cookie: employerA.cookie,
      },
    });

    expect(ownerResponse.statusCode).toBe(200);

    const ownerApplications = ownerResponse.json();

    expect(Array.isArray(ownerApplications)).toBe(true);
    expect(ownerApplications).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: applicationId })]),
    );

    const otherEmployerResponse = await app.inject({
      method: "GET",
      url: `/employer/jobs/${jobId}/applications`,
      headers: {
        cookie: employerB.cookie,
      },
    });

    expect(otherEmployerResponse.statusCode).toBe(200);
    expect(otherEmployerResponse.json()).toEqual([]);
  });

  it("rejects duplicate job applications", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/jobs/${jobId}/apply`,
      headers: {
        origin,
        cookie: seeker.cookie,
      },
      payload: {
        coverLetter: "Applying again.",
      },
    });

    expect(response.statusCode).toBe(409);
  });

  it("prevents employers from applying as seekers", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/jobs/${jobId}/apply`,
      headers: {
        origin,
        cookie: employerA.cookie,
      },
      payload: {
        coverLetter: "Unauthorized employer application.",
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("prevents Employer B from updating Employer A's applicant", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/employer/applications/${applicationId}`,
      headers: {
        origin,
        cookie: employerB.cookie,
      },
      payload: { status: "rejected" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("allows Employer A to review their own applicant", async () => {
    const response = await app.inject({
      method: "PATCH",
      url: `/employer/applications/${applicationId}`,
      headers: {
        origin,
        cookie: employerA.cookie,
      },
      payload: { status: "reviewing" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("reviewing");
  });
});

describe("Application tracking timeline", () => {
  it("records the initial submitted status", async () => {
    const response = await getTimeline(seeker.cookie);

    expect(response.statusCode).toBe(200);

    const entries = response.json() as TimelineEntry[];

    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          application_id: applicationId,
          status: "submitted",
          note: "Application submitted",
        }),
      ]),
    );
  });

  it("allows a seeker to view their own timeline", async () => {
    const response = await getTimeline(seeker.cookie);

    expect(response.statusCode).toBe(200);

    const entries = response.json() as TimelineEntry[];

    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries[0].status).toBe("submitted");
    expect(entries[1].status).toBe("reviewing");

    for (const entry of entries) {
      expect(entry.application_id).toBe(applicationId);
      expect(entry.id).toBeDefined();
      expect(entry.created_at).toBeDefined();
    }
  });

  it("prevents another seeker from viewing the timeline", async () => {
    const response = await getTimeline(seekerB.cookie);

    expect(response.statusCode).toBe(404);
  });

  it("allows the owning employer to view the timeline", async () => {
    const response = await getTimeline(employerA.cookie);

    expect(response.statusCode).toBe(200);

    const entries = response.json() as TimelineEntry[];

    expect(entries.some((entry) => entry.status === "submitted")).toBe(true);
    expect(entries.some((entry) => entry.status === "reviewing")).toBe(true);
  });

  it("prevents another employer from viewing the timeline", async () => {
    const response = await getTimeline(employerB.cookie);

    expect(response.statusCode).toBe(404);
  });

  it("requires authentication to view the timeline", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/applications/${applicationId}/timeline`,
    });

    expect(response.statusCode).toBe(401);
  });

  it("returns 404 for an unknown application", async () => {
    const response = await getTimeline(seeker.cookie, randomUUID());

    expect(response.statusCode).toBe(404);
  });

  it("records employer status changes in chronological order", async () => {
    const update = await app.inject({
      method: "PATCH",
      url: `/employer/applications/${applicationId}`,
      headers: {
        origin,
        cookie: employerA.cookie,
      },
      payload: { status: "shortlisted" },
    });

    expect(update.statusCode).toBe(200);
    expect(update.json().status).toBe("shortlisted");

    const response = await getTimeline(seeker.cookie);

    expect(response.statusCode).toBe(200);

    const entries = response.json() as TimelineEntry[];

    expect(entries.map((entry) => entry.status)).toEqual([
      "submitted",
      "reviewing",
      "shortlisted",
    ]);

    expect(entries[2]).toEqual(
      expect.objectContaining({
        application_id: applicationId,
        status: "shortlisted",
        note: "Status changed from reviewing to shortlisted",
      }),
    );

    const timestamps = entries.map((entry) =>
      new Date(entry.created_at).getTime(),
    );

    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
  });

  it("does not create duplicate history for unchanged status", async () => {
    const beforeResponse = await getTimeline(seeker.cookie);

    expect(beforeResponse.statusCode).toBe(200);

    const before = beforeResponse.json() as TimelineEntry[];

    const update = await app.inject({
      method: "PATCH",
      url: `/employer/applications/${applicationId}`,
      headers: {
        origin,
        cookie: employerA.cookie,
      },
      payload: {
        status: "shortlisted",
      },
    });

    expect(update.statusCode).toBe(200);
    expect(update.json().status).toBe("shortlisted");

    const afterResponse = await getTimeline(seeker.cookie);

    expect(afterResponse.statusCode).toBe(200);

    const after = afterResponse.json() as TimelineEntry[];

    expect(after).toEqual(before);
  });
});
