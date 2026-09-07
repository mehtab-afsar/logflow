/**
 * IndexedDB-backed upload queue for the driver portal.
 *
 * WHY: the driver photographs the signed POD at a loading dock where there is
 * often no usable signal. Losing that photo means the office chases paper for
 * another two weeks, which is the exact problem this product exists to solve.
 * So nothing is ever sent directly — everything is enqueued first, then
 * drained. The queue survives the tab being closed, the phone locking, and the
 * driver switching to WhatsApp.
 *
 * Blobs are stored natively rather than as base64 data URLs: base64 is 33%
 * larger and would exhaust the ~50MB origin quota after roughly 30 PODs.
 */

export type JobKind = "pod" | "milestone" | "expense";
export type JobStatus = "pending" | "inflight" | "done" | "failed";

export interface Job {
  /** Also sent as `client_id`. Generated once at enqueue, NEVER regenerated on
   *  retry — this is what makes a replayed request a no-op server-side. */
  id: string;
  /** Monotonic, so milestones drain in causal order. */
  seq: number;
  token: string;
  kind: JobKind;
  payload: Record<string, unknown>;
  blob?: Blob;
  mime?: string;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  status: JobStatus;
  lastError?: string;
}

const DB_NAME = "logiflow-driver";
const DB_VERSION = 1;
const JOBS = "jobs";
const META = "meta";

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(JOBS)) {
        const store = db.createObjectStore(JOBS, { keyPath: "id" });
        store.createIndex("by_status_next", ["status", "nextAttemptAt"]);
        store.createIndex("by_seq", "seq");
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: "k" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

async function nextSeq(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(META, "readwrite");
    const store = t.objectStore(META);
    const get = store.get("seq");
    get.onsuccess = () => {
      const current = (get.result?.v as number | undefined) ?? 0;
      const next = current + 1;
      store.put({ k: "seq", v: next });
      resolve(next);
    };
    get.onerror = () => reject(get.error);
  });
}

export async function enqueue(
  input: Omit<Job, "seq" | "createdAt" | "attempts" | "nextAttemptAt" | "status">,
): Promise<Job> {
  const job: Job = {
    ...input,
    seq: await nextSeq(),
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: 0,
    status: "pending",
  };
  await tx(JOBS, "readwrite", (s) => s.put(job));
  return job;
}

export async function allJobs(): Promise<Job[]> {
  const jobs = await tx<Job[]>(JOBS, "readonly", (s) => s.getAll());
  return jobs.sort((a, b) => a.seq - b.seq);
}

export async function dueJobs(now = Date.now()): Promise<Job[]> {
  const jobs = await allJobs();
  return jobs.filter((j) => j.status === "pending" && j.nextAttemptAt <= now);
}

export async function pendingCount(): Promise<number> {
  const jobs = await allJobs();
  return jobs.filter((j) => j.status === "pending" || j.status === "inflight").length;
}

export async function failedCount(): Promise<number> {
  const jobs = await allJobs();
  return jobs.filter((j) => j.status === "failed").length;
}

export async function updateJob(id: string, patch: Partial<Job>): Promise<void> {
  const existing = await tx<Job | undefined>(JOBS, "readonly", (s) => s.get(id));
  if (!existing) return;
  await tx(JOBS, "readwrite", (s) => s.put({ ...existing, ...patch }));
}

export async function removeJob(id: string): Promise<void> {
  await tx(JOBS, "readwrite", (s) => s.delete(id));
}

/** Reset failed jobs so the driver's "Retry all" button works. */
export async function retryAllFailed(): Promise<number> {
  const jobs = await allJobs();
  const failed = jobs.filter((j) => j.status === "failed");
  for (const j of failed) {
    await updateJob(j.id, { status: "pending", attempts: 0, nextAttemptAt: 0, lastError: undefined });
  }
  return failed.length;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await tx<{ k: string; v: T } | undefined>(META, "readonly", (s) => s.get(key));
  return row?.v;
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  await tx(META, "readwrite", (s) => s.put({ k: key, v: value }));
}

/** Exponential backoff with jitter: 1s, 2s, 4s … capped at 60s.
 *  The jitter stops eight queued PODs retrying in the same tick on a flaky
 *  tower and knocking each other over. */
export function backoffMs(attempts: number): number {
  return Math.min(60_000, 1000 * 2 ** attempts) + Math.floor(Math.random() * 500);
}

export const MAX_ATTEMPTS = 8;
