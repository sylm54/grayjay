/**
 * Blocking fetch for the plugin harness.
 *
 * The Grayjay engine performs all plugin HTTP synchronously (the app blocks
 * its V8 thread while requests run concurrently). Real JS runtimes cannot
 * await inside synchronous plugin code, so we bridge to a Worker and block
 * the host thread with Atomics.wait — the same trick used by deasync-style
 * libraries. On Bun/Node, Atomics.wait is legal on the main thread.
 */

import { Worker } from "node:worker_threads";

const WORKER_SOURCE = String.raw`
const { parentPort } = require("node:worker_threads");
const enc = new TextEncoder();

parentPort.on("message", (msg) => {
  const { id, sab, requests } = msg;
  const status = new Int32Array(sab, 0, 1);
  Promise.all(
    requests.map(async (req) => {
      try {
        const controller = new AbortController();
        const timer = req.timeoutMs ? setTimeout(() => controller.abort(), req.timeoutMs) : null;
        const resp = await fetch(req.url, {
          method: req.method,
          headers: req.headers,
          body: req.body,
          redirect: "follow",
          signal: controller.signal,
        });
        if (timer) clearTimeout(timer);
        const headers = {};
        for (const [k, v] of resp.headers) headers[k.toLowerCase()] = v;
        const body = await resp.text();
        return { ok: resp.ok, code: resp.status, url: resp.url, headers, body };
      } catch (err) {
        return { code: -1, url: req.url, headers: {}, body: String(err && err.message ? err.message : err), error: true };
      }
    })
  ).then((responses) => {
    const json = JSON.stringify({ id, responses });
    const bytes = enc.encode(json);
    const needed = bytes.length + 8;
    if (needed > sab.byteLength) {
      // Signal overflow with the required size so the caller retries bigger.
      new Int32Array(sab, 4, 1)[0] = needed;
      Atomics.store(status, 0, 2);
      Atomics.notify(status, 0);
      return;
    }
    new Uint8Array(sab, 8).set(bytes);
    new Int32Array(sab, 4, 1)[0] = needed;
    Atomics.store(status, 0, 1);
    Atomics.notify(status, 0);
  }).catch((err) => {
    const bytes = enc.encode(JSON.stringify({ id, fatal: String(err) }));
    new Uint8Array(sab, 8).set(bytes);
    new Int32Array(sab, 4, 1)[0] = bytes.length + 8;
    Atomics.store(status, 0, 1);
    Atomics.notify(status, 0);
  });
});
`;

export interface SyncFetchRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

export interface SyncFetchResponse {
  code: number;
  url: string;
  headers: Record<string, string>;
  body: string;
  error?: boolean;
}

let worker: Worker | null = null;
let messageId = 0;

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(WORKER_SOURCE, { eval: true });
  worker.unref();
  return worker;
}

/**
 * Execute requests concurrently, blocking the current thread until all
 * complete — mirroring `http.batch().execute()` semantics.
 */
export function syncFetchAll(requests: SyncFetchRequest[], timeoutMs = 30_000): SyncFetchResponse[] {
  const id = ++messageId;
  let size = 1 << 20; // start at 1 MiB, grow if the payload overflows
  for (let attempt = 0; attempt < 3; attempt++) {
    const sab = new SharedArrayBuffer(size);
    const status = new Int32Array(sab, 0, 1);
    const w = getWorker();
    w.postMessage({ id, sab, requests });

    const waitResult = Atomics.wait(status, 0, 0, timeoutMs);
    if (waitResult === "timed-out") {
      throw new Error(`sync-fetch timed out after ${timeoutMs}ms (${requests.length} request(s))`);
    }
    const flag = Atomics.load(status, 0);
    const needed = new Int32Array(sab, 4, 1)[0]!;
    if (flag === 2) {
      size = needed + 64;
      continue;
    }
    if (flag !== 1) throw new Error(`sync-fetch failed (status=${flag})`);
    const bytes = new Uint8Array(sab, 8, needed - 8);
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
      id: number;
      responses?: SyncFetchResponse[];
      fatal?: string;
    };
    if (parsed.fatal) throw new Error(`sync-fetch worker error: ${parsed.fatal}`);
    if (parsed.id !== id) throw new Error("sync-fetch response id mismatch");
    return parsed.responses ?? [];
  }
  throw new Error("sync-fetch: response did not fit after retries");
}

export function syncFetch(request: SyncFetchRequest, timeoutMs?: number): SyncFetchResponse {
  const [resp] = syncFetchAll([request], timeoutMs);
  if (!resp) throw new Error("sync-fetch: no response");
  return resp;
}

/** Terminate the shared worker (called between test files). */
export function disposeSyncFetchWorker(): void {
  worker?.terminate();
  worker = null;
}
