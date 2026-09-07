/**
 * The offline upload queue is the feature that decides whether the driver
 * portal works at a loading dock. These tests encode the failure modes that
 * actually happen on a 2G tower.
 */
import {
  enqueue, allJobs, dueJobs, updateJob, pendingCount, failedCount,
  retryAllFailed, backoffMs, MAX_ATTEMPTS, openDb,
} from "@/features/driver/utils/queue-db";
import { drain } from "@/features/driver/utils/queue-drain";

// A fresh database per test: fake-indexeddb is module-global.
beforeEach(async () => {
  const db = await openDb();
  await new Promise<void>((resolve) => {
    const t = db.transaction(["jobs", "meta"], "readwrite");
    t.objectStore("jobs").clear();
    t.objectStore("meta").clear();
    t.oncomplete = () => resolve();
  });
});

/** jsdom has no global Response. The drain only reads ok/status/json(). */
function res(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

async function addMilestone(id: string, kind = "loaded") {
  return enqueue({ id, token: "tok", kind: "milestone", payload: { kind } });
}

describe("backoff", () => {
  it("doubles and caps at 60s", () => {
    // Jitter is up to 500ms, so assert on the floor.
    expect(backoffMs(1)).toBeGreaterThanOrEqual(2000);
    expect(backoffMs(1)).toBeLessThan(2600);
    expect(backoffMs(3)).toBeGreaterThanOrEqual(8000);
    expect(backoffMs(10)).toBeGreaterThanOrEqual(60_000);
    expect(backoffMs(10)).toBeLessThan(60_600);
  });

  it("adds jitter so simultaneous retries spread out", () => {
    const samples = new Set(Array.from({ length: 20 }, () => backoffMs(4)));
    expect(samples.size).toBeGreaterThan(1);
  });
});

describe("enqueue", () => {
  it("assigns monotonically increasing sequence numbers", async () => {
    await addMilestone("a");
    await addMilestone("b");
    await addMilestone("c");
    const jobs = await allJobs();
    expect(jobs.map((j) => j.seq)).toEqual([1, 2, 3]);
    expect(jobs.map((j) => j.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps the caller-supplied id — it is the server dedup key", async () => {
    const job = await addMilestone("stable-id");
    expect(job.id).toBe("stable-id");
  });
});

describe("drain — success paths", () => {
  it("removes a job on 200", async () => {
    await addMilestone("a");
    const result = await drain(async () => res(200));
    expect(result.sent).toBe(1);
    expect(await pendingCount()).toBe(0);
  });

  it("treats 409 as success — the server already has it", async () => {
    await addMilestone("a");
    const result = await drain(async () => res(409, { error: "duplicate" }));
    expect(result.sent).toBe(1);
    expect(await allJobs()).toHaveLength(0);
  });

  it("sends jobs in sequence order", async () => {
    await addMilestone("a", "loaded");
    await addMilestone("b", "departed");
    await addMilestone("c", "unloaded");
    const seen: string[] = [];
    await drain(async (url, init) => {
      seen.push(JSON.parse(String((init as RequestInit).body)).kind);
      return res(200);
    });
    expect(seen).toEqual(["loaded", "departed", "unloaded"]);
  });
});

describe("drain — failure paths", () => {
  it("never retries a 4xx: a malformed payload stays malformed", async () => {
    await addMilestone("a");
    await drain(async () => res(422, { error: "bad milestone" }));
    const [job] = await allJobs();
    expect(job.status).toBe("failed");
    expect(job.attempts).toBe(0);        // not retried at all
    expect(job.lastError).toBe("bad milestone");
  });

  it("retries a 5xx with backoff", async () => {
    await addMilestone("a");
    await drain(async () => res(500));
    const [job] = await allJobs();
    expect(job.status).toBe("pending");
    expect(job.attempts).toBe(1);
    expect(job.nextAttemptAt).toBeGreaterThan(Date.now());
  });

  it("parks a job after MAX_ATTEMPTS and surfaces a human message", async () => {
    await addMilestone("a");
    await updateJob("a", { attempts: MAX_ATTEMPTS - 1 });
    await drain(async () => res(503));
    const [job] = await allJobs();
    expect(job.status).toBe("failed");
    expect(job.lastError).toMatch(/Retry/i);
  });

  it("stops the whole pass when the link is dead", async () => {
    await addMilestone("a");
    await addMilestone("b");
    const result = await drain(async () => res(401));
    expect(result.linkDead).toBe(true);
    const jobs = await allJobs();
    expect(jobs.find((j) => j.id === "a")!.status).toBe("failed");
    // 'b' was never attempted.
    expect(jobs.find((j) => j.id === "b")!.status).toBe("pending");
  });

  it("a failed MILESTONE blocks later ones (causal order must hold)", async () => {
    await addMilestone("a", "departed");
    await addMilestone("b", "unloaded");
    let calls = 0;
    await drain(async () => { calls += 1; return res(500); });
    expect(calls).toBe(1);   // stopped after the first failure
  });

  it("a failed POD does not block the next job (they commute)", async () => {
    await enqueue({ id: "p1", token: "t", kind: "pod", payload: { page_no: 1 }, blob: new Blob(["x"]) });
    await enqueue({ id: "p2", token: "t", kind: "pod", payload: { page_no: 2 }, blob: new Blob(["y"]) });
    let calls = 0;
    await drain(async () => { calls += 1; return res(500); });
    expect(calls).toBe(2);   // both attempted
  });
});

describe("drain — offline", () => {
  it("stops immediately when the device reports offline", async () => {
    await addMilestone("a");
    const spy = jest.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    let calls = 0;
    await drain(async () => { calls += 1; return res(200); });
    expect(calls).toBe(0);
    expect(await pendingCount()).toBe(1);   // still safe on the phone
    spy.mockRestore();
  });
});

describe("retry all", () => {
  it("resets failed jobs so the driver's Retry button works", async () => {
    await addMilestone("a");
    await drain(async () => res(422, { error: "nope" }));
    expect(await failedCount()).toBe(1);

    const reset = await retryAllFailed();
    expect(reset).toBe(1);

    const [job] = await allJobs();
    expect(job.status).toBe("pending");
    expect(job.attempts).toBe(0);

    await drain(async () => res(200));
    expect(await allJobs()).toHaveLength(0);
  });
});

describe("due scheduling", () => {
  it("does not resend a job before its backoff elapses", async () => {
    await addMilestone("a");
    await updateJob("a", { nextAttemptAt: Date.now() + 60_000 });
    expect(await dueJobs()).toHaveLength(0);
  });
});
