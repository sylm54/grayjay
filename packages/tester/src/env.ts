/**
 * The plugin harness: load a built plugin script into an isolated vm context
 * wired to a faithful engine environment (polyfill classes, packages,
 * synchronous http), then call its `source` methods from your tests.
 */

import vm from "node:vm";
import { pathToFileURL } from "node:url";
import { isAbsolute, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Source } from "@grayjay/runtime";
import type { SourcePluginConfig } from "@grayjay/config";
import { polyfill } from "@grayjay/runtime";
import { createHttpPackage, type HarnessHttp, type HttpRequestRecord, type MockHandler } from "./http.js";
import { createDomParserPackage } from "./domparser.js";

export type { MockHandler, HttpRequestRecord, HarnessHttp } from "./http.js";

export interface LoadPluginOptions {
  /** Config object, or a path (resolved against cwd) to grayjay.config.ts/.json. */
  config: SourcePluginConfig | string;
  /** Built script content, or a path (resolved against cwd) to the dist script. */
  script: string;
  /** Settings passed to `source.enable` (string values JSON-parsed like the app). */
  settings?: Record<string, string | number | boolean>;
  /** Saved state passed to `source.enable`. */
  savedState?: string | null;
  /**
   * Http behavior: `{ mock: handler }` for deterministic offline tests
   * (default: real network via the sync bridge, allowUrls enforced).
   */
  http?: { mock?: MockHandler };
  /** Override config `packages` detection (e.g. force DOMParser without linkedom errors at load). */
  packages?: { domParser?: boolean };
  /** Called for every `log()`/`bridge.log()` line. */
  onLog?: (line: string) => void;
}

export interface PluginEnv {
  /** Call plugin methods directly, e.g. `env.source.getHome()`. */
  source: Source;
  config: SourcePluginConfig;
  /** Every log line the plugin produced. */
  logs: string[];
  /** Every toast the plugin showed. */
  toasts: string[];
  /** Requests recorded from the http package. */
  requests: HttpRequestRecord[];
  http: HarnessHttp;
  /** Re-run `source.enable` (e.g. to test state restore). */
  enable(settings?: Record<string, string | number | boolean>, savedState?: string | null): void;
  /** True when the plugin uses http batch features (smoke info). */
  readonly scriptDefinesPlugin: boolean;
}

function resolvePath(p: string): string {
  return isAbsolute(p) ? p : resolve(p);
}

/** Mirror of the engine's parseSettings: JSON.parse string values when possible. */
export function parseSettings(settings: Record<string, unknown> | undefined): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(settings ?? {})) {
    if (typeof value === "string") {
      try {
        result[key] = JSON.parse(value);
      } catch {
        result[key] = value;
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

async function loadConfig(config: SourcePluginConfig | string): Promise<SourcePluginConfig> {
  if (typeof config !== "string") return config;
  const path = resolvePath(config);
  if (path.endsWith(".json")) {
    return (await Bun.file(path).json()) as SourcePluginConfig;
  }
  const mod = (await import(pathToFileURL(path).href)) as {
    default?: SourcePluginConfig | { config?: SourcePluginConfig };
    config?: SourcePluginConfig;
  };
  const fromDefault = mod.default && "name" in mod.default ? mod.default : mod.default?.config;
  const cfg = fromDefault ?? mod.config;
  if (!cfg) throw new Error(`No default export or named export "config" found in ${path}`);
  return cfg;
}

/**
 * Load and enable a plugin. Throws with the plugin's own error messages when
 * the script fails to evaluate.
 */
export async function loadPlugin(options: LoadPluginOptions): Promise<PluginEnv> {
  const config = await loadConfig(options.config);
  const scriptContent = options.script.trimEnd().endsWith(".js")
    ? await Bun.file(resolvePath(options.script)).text()
    : options.script;

  const logs: string[] = [];
  const toasts: string[] = [];
  const onLog = options.onLog ?? (() => {});
  const pushLog = (line: string) => {
    logs.push(line);
    onLog(line);
  };

  // --- polyfill globals -----------------------------------------------------
  const globals = polyfill.createPolyfillGlobals({ log: pushLog });
  const parsedSettings = parseSettings(options.settings);
  (globals.plugin as { config: unknown; settings: unknown }).config = {
    ...config,
    constants: config.constants ?? {},
  };
  (globals.plugin as { config: unknown; settings: unknown }).settings = parsedSettings;

  // --- engine packages --------------------------------------------------------
  const packages = config.packages ?? [];
  const sandbox: Record<string, unknown> = { ...globals };

  const wantsHttp = packages.includes("Http") || packages.includes("HttpImp");
  if (wantsHttp || options.http?.mock) {
    const httpPkg = createHttpPackage({
      allowUrls: config.allowUrls ?? ["everywhere"],
      mock: options.http?.mock,
    });
    sandbox.http = httpPkg;

    // Record requests both on the package and the env.
    Object.defineProperty(sandbox, "__requests", { value: httpPkg.requests, enumerable: false });
  }

  const timerHandles: number[] = [];
  const bridgePackage = {
    buildVersion: 999_999_999,
    buildFlavor: "test",
    buildSpecVersion: 1,
    buildPlatform: "harness",
    supportedFeatures: ["ReloadRequiredException", "HttpBatchClient", "UMPSource"],
    supportedContent: [1, 2, 3, 4, 7, 11, 70],
    captchaUserAgent: null,
    authUserAgent: null,
    log: pushLog,
    toast: (message: string) => toasts.push(message),
    // Synchronous sleep like the engine's Thread.sleep.
    sleep: (ms: number) => {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(ms, 5_000));
    },
    setTimeout: (callback: () => void, ms = 0) => {
      const id = setTimeout(() => callback(), ms);
      timerHandles.push(Number(id));
      return Number(id);
    },
    clearTimeout: (id: number) => clearTimeout(id),
    hasPackage: (name: string) => (packages as string[]).includes(name),
    isLoggedIn: () => false,
    getHardwareCodecs: () => [],
    dispose: () => {},
  };

  if (packages.includes("Utilities")) {
    sandbox.utility = {
      toBase64: (data: Uint8Array) => Buffer.from(data).toString("base64").replace(/=+$/, ""),
      fromBase64: (data: string) => new Uint8Array(Buffer.from(data, "base64")),
      md5: (data: Uint8Array) => new Uint8Array(createHash("md5").update(data).digest()),
      md5String: (data: string) => createHash("md5").update(data).digest("hex"),
      sha256: (data: Uint8Array) => new Uint8Array(createHash("sha256").update(data).digest()),
      sha256String: (data: string) => createHash("sha256").update(data).digest("hex"),
      randomUUID: () => randomUUID(),
    };
  }

  const wantsDomParser = options.packages?.domParser ?? packages.includes("DOMParser");
  if (wantsDomParser) {
    sandbox.domParser = await createDomParserPackage();
  }
  if (packages.includes("JSDOM")) {
    // Harness treats JSDOM like the DOMParser package (linkedom-backed).
    sandbox.JSDOM = sandbox.domParser;
  }

  // --- engine-provided misc globals ---------------------------------------------
  sandbox.bridge = bridgePackage;
  sandbox.console = { log: pushLog, warn: pushLog, error: pushLog };
  sandbox.setTimeout = bridgePackage.setTimeout;
  sandbox.clearTimeout = bridgePackage.clearTimeout;
  sandbox.btoa = (data: string) => Buffer.from(data, "binary").toString("base64");
  sandbox.atob = (data: string) => Buffer.from(data, "base64").toString("binary");

  // --- evaluate -----------------------------------------------------------------
  const context = vm.createContext(sandbox);
  try {
    vm.runInContext(scriptContent, context, { filename: "plugin.js" });
  } catch (err) {
    throw new Error(
      `Plugin script failed to evaluate: ${(err as Error).message}\n` +
        `Fix the script, rebuild, and re-run.`,
      { cause: err },
    );
  }

  const source = globals.source as unknown as Source;

  const env: PluginEnv = {
    source,
    config,
    logs,
    toasts,
    requests: (sandbox.__requests as HttpRequestRecord[] | undefined) ?? [],
    http: sandbox.http as HarnessHttp,
    enable(settings, savedState) {
      const enableFn = (source as { enable?: (...args: unknown[]) => void }).enable;
      if (enableFn) {
        enableFn(
          { ...config, constants: config.constants ?? {} },
          parseSettings(settings ?? options.settings),
          savedState ?? options.savedState ?? null,
        );
      }
    },
    scriptDefinesPlugin: typeof (globals.definePlugin as unknown) === "function" && scriptContent.includes("definePlugin("),
  };

  // Mirror JSClient's ensureEnabled: enable on first use happens right away.
  env.enable();
  return env;
}

/**
 * Follow a pager's pages, collecting every item. Stops at `maxPages` or
 * `maxItems`, or when `hasMore` turns false.
 */
export function collectPages<TItem = unknown>(
  pager: { results: TItem[]; hasMore: boolean; nextPage?: () => unknown },
  options: { maxPages?: number; maxItems?: number } = {},
): TItem[] {
  const maxPages = options.maxPages ?? 10;
  const maxItems = options.maxItems ?? Number.POSITIVE_INFINITY;
  const items: TItem[] = [...pager.results];
  let current: { results: TItem[]; hasMore: boolean; nextPage?: () => unknown } = pager;
  let pages = 1;
  while (current.hasMore && pages < maxPages && items.length < maxItems) {
    const next = current.nextPage?.();
    if (next && typeof next === "object") current = next as typeof current;
    items.push(...current.results);
    pages += 1;
  }
  return items;
}

/** Wait for any pending plugin setTimeout callbacks (ms grace period). */
export async function flushTimers(env: PluginEnv, graceMs = 50): Promise<void> {
  await new Promise((r) => setTimeout(r, graceMs));
  void env;
}
