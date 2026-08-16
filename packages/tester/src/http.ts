/**
 * Harness implementation of the engine's Http package: same method surface
 * (`GET`/`POST`/`request`/`requestWithBody`/`batch`/`newClient`), synchronous
 * like the engine, with `allowUrls` enforced the way the app enforces it.
 */

import type { BatchBuilder, BridgeHttpResponse, HttpPackage, HttpHeaders } from "@grayjay/runtime";
import { syncFetchAll, type SyncFetchRequest, type SyncFetchResponse } from "./sync-fetch.js";

export interface HttpRequestRecord {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  useAuthClient: boolean;
}

export interface MockResponse {
  code?: number;
  body?: string;
  headers?: Record<string, string>;
}

export type MockHandler = (request: HttpRequestRecord & { index: number }) => MockResponse | string;

function toBridgeResponse(resp: SyncFetchResponse): BridgeHttpResponse {
  return {
    code: resp.code,
    body: resp.body,
    headers: resp.headers,
    isOk: resp.code >= 200 && resp.code < 300,
    url: resp.url,
  };
}

/** Match a host against the app's isUrlAllowed rules. */
export function isUrlAllowed(url: string, allowUrls: string[]): boolean {
  const lowered = allowUrls.map((u) => u.toLowerCase());
  if (lowered.includes("everywhere")) return true;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return lowered.some((allowed) => {
    if (allowed === host) return true;
    if (allowed.startsWith(".")) {
      // ".platform.com" matches any *.platform.com (and platform.com itself per app behavior).
      const suffix = allowed.slice(1);
      return host === suffix || host.endsWith(allowed);
    }
    return false;
  });
}

class BlockedException extends Error {
  constructor(url: string, allowUrls: string[]) {
    super(
      `Blocked by allowUrls: ${url} (allowed: ${allowUrls.join(", ") || "nothing"}). ` +
        `Add the host to allowUrls in your plugin config.`,
    );
    this.name = "ScriptException";
  }
}

interface RequestSpec {
  method: string;
  url: string;
  headers?: HttpHeaders;
  body?: string;
  useAuthClient?: boolean;
}

interface HttpMode {
  perform(specs: RequestSpec[]): BridgeHttpResponse[];
  record?(specs: RequestSpec[]): void;
}

class RealHttpMode implements HttpMode {
  constructor(
    private readonly allowUrls: string[],
    private readonly defaultHeaders: HttpHeaders,
    private readonly records: HttpRequestRecord[],
  ) {}

  perform(specs: RequestSpec[]): BridgeHttpResponse[] {
    this.record(specs);
    const requests: SyncFetchRequest[] = specs.map((s) => ({
      method: s.method,
      url: s.url,
      headers: { ...this.defaultHeaders, ...(s.headers ?? {}) },
      body: s.body,
    }));
    return syncFetchAll(requests).map(toBridgeResponse);
  }

  record(specs: RequestSpec[]): void {
    for (const s of specs) {
      if (!isUrlAllowed(s.url, this.allowUrls)) throw new BlockedException(s.url, this.allowUrls);
      this.records.push({
        method: s.method,
        url: s.url,
        headers: s.headers ?? {},
        body: s.body,
        useAuthClient: s.useAuthClient ?? false,
      });
    }
  }
}

class MockHttpMode implements HttpMode {
  constructor(
    private readonly handler: MockHandler,
    private readonly records: HttpRequestRecord[],
    private readonly throwOnUnhandled: boolean,
  ) {}

  perform(specs: RequestSpec[]): BridgeHttpResponse[] {
    this.record(specs);
    return specs.map((s) => {
      const index = this.records.length - 1;
      const result = this.handler({ ...s, headers: s.headers ?? {}, body: s.body, useAuthClient: s.useAuthClient ?? false, index });
      const mock: MockResponse = typeof result === "string" ? { body: result, code: 200 } : result;
      if (!mock) {
        if (this.throwOnUnhandled) {
          throw new Error(`mockHttp: no handler result for ${s.method} ${s.url}`);
        }
        return { code: 599, body: "", headers: {}, isOk: false, url: s.url };
      }
      const code = mock.code ?? 200;
      return {
        code,
        body: mock.body ?? "",
        headers: mock.headers ?? {},
        isOk: code >= 200 && code < 300,
        url: s.url,
      };
    });
  }

  record(specs: RequestSpec[]): void {
    for (const s of specs) {
      this.records.push({
        method: s.method,
        url: s.url,
        headers: s.headers ?? {},
        body: s.body,
        useAuthClient: s.useAuthClient ?? false,
      });
    }
  }
}

class BatchBuilderImpl implements BatchBuilder {
  private specs: RequestSpec[] = [];

  constructor(private readonly mode: HttpMode) {}

  GET(url: string, headers?: HttpHeaders, useAuthClient?: boolean): BatchBuilder {
    this.specs.push({ method: "GET", url, headers, useAuthClient });
    return this;
  }
  POST(url: string, body: string, headers?: HttpHeaders, useAuthClient?: boolean): BatchBuilder {
    this.specs.push({ method: "POST", url, body, headers, useAuthClient });
    return this;
  }
  request(method: string, url: string, headers?: HttpHeaders, useAuthClient?: boolean): BatchBuilder {
    this.specs.push({ method, url, headers, useAuthClient });
    return this;
  }
  requestWithBody(
    method: string,
    url: string,
    body: string,
    headers?: HttpHeaders,
    useAuthClient?: boolean,
  ): BatchBuilder {
    this.specs.push({ method, url, body, headers, useAuthClient });
    return this;
  }
  clientGET(_client: unknown, url: string, headers?: HttpHeaders): BatchBuilder {
    return this.GET(url, headers);
  }
  clientPOST(_client: unknown, url: string, body: string, headers?: HttpHeaders): BatchBuilder {
    return this.POST(url, body, headers);
  }
  execute(): BridgeHttpResponse[] {
    return this.mode.perform(this.specs);
  }
}

export interface HarnessHttp extends HttpPackage {
  /** Every request the plugin made, in order (for assertions). */
  readonly requests: HttpRequestRecord[];
}

export interface CreateHttpOptions {
  /** allowUrls from the plugin config; enforced for real requests. */
  allowUrls?: string[];
  /** Provide a mock handler for deterministic offline tests. */
  mock?: MockHandler;
  /** When mocking: throw on requests the handler doesn't meaningfully answer. */
  throwOnUnhandled?: boolean;
}

export function createHttpPackage(options: CreateHttpOptions = {}): HarnessHttp {
  const records: HttpRequestRecord[] = [];
  const mode: HttpMode = options.mock
    ? new MockHttpMode(options.mock, records, options.throwOnUnhandled ?? true)
    : new RealHttpMode(options.allowUrls ?? ["everywhere"], {}, records);

  const single = (spec: RequestSpec): BridgeHttpResponse => mode.perform([spec])[0]!;

  const pkg: Omit<HarnessHttp, "requests"> = {
    GET: (url, headers, useAuthClient) => single({ method: "GET", url, headers, useAuthClient }),
    POST: (url, body, headers, useAuthClient) => single({ method: "POST", url, body, headers, useAuthClient }),
    request: (method, url, headers, useAuthClient) => single({ method, url, headers, useAuthClient }),
    requestWithBody: (method, url, body, headers, useAuthClient) =>
      single({ method, url, body, headers, useAuthClient }),
    batch: () => new BatchBuilderImpl(mode),
    newClient: (useAuthClient = false) => {
      // The harness uses cookie-less clients; auth vs unauth is recorded only.
      const clientMode: HttpMode = {
        perform: (specs) => mode.perform(specs.map((s) => ({ ...s, useAuthClient }))),
      };
      return {
        GET: (url: string, headers?: HttpHeaders) => clientMode.perform([{ method: "GET", url, headers }])[0]!,
        POST: (url: string, body: string, headers?: HttpHeaders) =>
          clientMode.perform([{ method: "POST", url, body, headers }])[0]!,
        request: (method: string, url: string, headers?: HttpHeaders) =>
          clientMode.perform([{ method, url, headers }])[0]!,
        requestWithBody: (method: string, url: string, body: string, headers?: HttpHeaders) =>
          clientMode.perform([{ method, url, body, headers }])[0]!,
        batch: () => new BatchBuilderImpl(clientMode),
        setDefaultHeaders() {},
        setDoApplyCookies() {},
        setDoUpdateCookies() {},
        setDoAllowNewCookies() {},
      };
    },
  };
  return Object.defineProperty(pkg, "requests", {
    get: () => records,
    configurable: true,
  }) as HarnessHttp;
}

export { RealHttpMode, MockHttpMode, BlockedException };
export type { HttpMode };
