import { UUID_V4_REGEX, type EnginePackageName, type SourcePluginConfig } from "./schema.js";

export interface ValidationError {
  /** Dotted path into the config, e.g. `allowUrls[2]`. */
  path: string;
  message: string;
}

export type ValidationWarning = ValidationError;

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

const KNOWN_PACKAGES: EnginePackageName[] = ["Http", "HttpImp", "DOMParser", "JSDOM", "Utilities", "Browser"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate a config object the way the app will interpret it. Structural
 * errors (missing name, malformed id, bad package names, …) become `errors`;
 * risky-but-legal choices (unsigned, allowUrls everywhere, allowEval, …)
 * become `warnings` mirroring the app's own warning screens.
 */
export function validateConfig(config: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const fail = (path: string, message: string) => errors.push({ path, message });
  const warn = (path: string, message: string) => warnings.push({ path, message });

  if (!isPlainObject(config)) {
    fail("", "config must be a JSON object");
    return { valid: false, errors, warnings };
  }

  const c = config as Record<string, unknown>;

  if (typeof c.name !== "string" || c.name.trim() === "") fail("name", "must be a non-empty string");

  if (typeof c.version !== "number" || !Number.isInteger(c.version)) {
    fail("version", "must be an integer");
  } else if (c.version < 1) {
    fail("version", "must be >= 1");
  }

  if (typeof c.id !== "string" || !UUID_V4_REGEX.test(c.id)) {
    fail("id", "must be a UUID v4 (generate once, keep stable across releases)");
  }

  if (c.scriptUrl !== undefined && (typeof c.scriptUrl !== "string" || c.scriptUrl === "")) {
    fail("scriptUrl", "must be a non-empty string when present");
  }

  for (const key of ["scriptSignature", "scriptPublicKey"] as const) {
    const v = c[key];
    if (v === undefined || v === null || v === "") continue;
    if (typeof v !== "string") fail(key, "must be a base64 string");
  }
  if (c.scriptPublicKey && c.scriptSignature && typeof c.version === "number" && Number.isInteger(c.version)) {
    // both present: fine. App warns only when missing.
  } else if (!c.scriptSignature || !c.scriptPublicKey) {
    if (c.scriptSignature || c.scriptPublicKey) {
      warn("scriptSignature", "signature and publicKey must be set together; the app will treat the plugin as unsigned");
    } else {
      warn("scriptSignature", "unsigned plugin: users will see a security warning on install/update");
    }
  }

  if (c.allowEval === true) warn("allowEval", "eval access triggers a user security warning; avoid if possible");

  const allowUrls = c.allowUrls;
  if (allowUrls !== undefined) {
    if (!Array.isArray(allowUrls) || allowUrls.some((u) => typeof u !== "string")) {
      fail("allowUrls", "must be an array of domain strings (or [\"everywhere\"])");
    } else if ((allowUrls as string[]).some((u) => u.toLowerCase() === "everywhere")) {
      warn("allowUrls", '"everywhere" grants unrestricted web access and triggers a user security warning');
    } else if ((allowUrls as string[]).length === 0) {
      warn("allowUrls", "empty allowUrls: the plugin cannot make any http request");
    }
  }

  for (const key of ["packages", "packagesOptional"] as const) {
    const packs = c[key];
    if (packs === undefined) continue;
    if (!Array.isArray(packs) || packs.some((p) => typeof p !== "string")) {
      fail(key, "must be an array of package names");
      continue;
    }
    (packs as string[]).forEach((p, i) => {
      if (!KNOWN_PACKAGES.includes(p as EnginePackageName)) {
        fail(`${key}[${i}]`, `unknown package "${p}" (known: ${KNOWN_PACKAGES.join(", ")})`);
      }
      if (p === "Browser") {
        warn(`${key}[${i}]`, "Browser is restricted to official/debug builds and will fail to load elsewhere");
      }
    });
  }

  const httpUsed = Array.isArray(c.packages) && (c.packages as string[]).includes("Http");
  const hasAllowUrls = Array.isArray(c.allowUrls) && (c.allowUrls as string[]).length > 0;
  if (httpUsed && !hasAllowUrls) {
    warn("allowUrls", "Http package requested but allowUrls is empty: all requests will be blocked");
  }

  if (c.authentication !== undefined && c.authentication !== null) {
    if (!isPlainObject(c.authentication)) {
      fail("authentication", "must be an object");
    } else if (typeof c.authentication.loginUrl !== "string" || (c.authentication.loginUrl as string) === "") {
      fail("authentication.loginUrl", "is required when authentication is present");
    }
  }

  if (c.settings !== undefined) {
    if (!Array.isArray(c.settings)) {
      fail("settings", "must be an array");
    } else {
      (c.settings as unknown[]).forEach((s, i) => {
        if (!isPlainObject(s)) {
          fail(`settings[${i}]`, "must be an object");
          return;
        }
        if (typeof s.name !== "string" || (s.name as string) === "") fail(`settings[${i}].name`, "is required");
        if (typeof s.description !== "string") fail(`settings[${i}].description`, "is required (may be empty)");
        if (typeof s.type !== "string" || (s.type as string) === "") fail(`settings[${i}].type`, "is required");
        const type = s.type as string;
        if (type === "Dropdown" && (!Array.isArray(s.options) || s.options.length === 0)) {
          fail(`settings[${i}].options`, "Dropdown settings require at least one option");
        }
        // The engines run JSON.parse over setting values (parseSettings);
        // non-JSON defaults crash plugin initialization at startup.
        const defaultValue = s.default;
        if (typeof defaultValue === "string" && defaultValue !== "" && type !== "Header") {
          try {
            JSON.parse(defaultValue);
          } catch {
            warn(
              `settings[${i}].default`,
              `"${defaultValue.slice(0, 30)}" is not JSON-parseable — the engine's parseSettings will crash on it. ` +
                `Use JSON forms like "true"/"false"/"0" (dropdown selections are stored as 0-based indices).`,
            );
          }
        }
        const variables = (c.settings as Array<{ variable?: string; name?: string }>).map(
          (x) => x.variable ?? x.name ?? "",
        );
        const variable = (s.variable as string | undefined) ?? (s.name as string | undefined) ?? "";
        if (variables.filter((v) => v === variable).length > 1) {
          fail(`settings[${i}]`, `duplicate setting variable "${variable}"`);
        }
      });
    }
  }

  if (c.constants !== undefined) {
    if (!isPlainObject(c.constants) || Object.values(c.constants).some((v) => typeof v !== "string")) {
      fail("constants", "must be an object mapping names to string values");
    }
  }

  if (c.changelog !== undefined && c.changelog !== null) {
    if (!isPlainObject(c.changelog) || Object.values(c.changelog).some((v) => !Array.isArray(v))) {
      fail("changelog", "must map version strings to arrays of lines");
    }
  }

  if (c.maxDownloadParallelism !== undefined && typeof c.maxDownloadParallelism !== "number") {
    fail("maxDownloadParallelism", "must be a number (0 = default)");
  }

  if (typeof c.sourceUrl === "string" && !/^https?:\/\//i.test(c.sourceUrl)) {
    warn("sourceUrl", "should be an absolute http(s) url so installed plugins can find updates");
  }

  const suspiciousKeys = Object.keys(c).filter(
    (k) =>
      ![
        "name",
        "description",
        "author",
        "authorUrl",
        "repositoryUrl",
        "scriptUrl",
        "version",
        "iconUrl",
        "id",
        "scriptSignature",
        "scriptPublicKey",
        "allowEval",
        "allowUrls",
        "packages",
        "packagesOptional",
        "settings",
        "captcha",
        "authentication",
        "sourceUrl",
        "constants",
        "platformUrl",
        "subscriptionRateLimit",
        "enableInSearch",
        "enableInHome",
        "enableInShorts",
        "supportedClaimTypes",
        "primaryClaimFieldType",
        "developerSubmitUrl",
        "allowAllHttpHeaderAccess",
        "maxDownloadParallelism",
        "reduceFunctionsInLimitedVersion",
        "changelog",
      ].includes(k),
  );
  for (const key of suspiciousKeys) warn(key, "unknown config key (ignored by the app)");

  return { valid: errors.length === 0, errors, warnings };
}
