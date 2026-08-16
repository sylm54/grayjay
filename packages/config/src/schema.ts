/**
 * The Grayjay plugin config schema, mirroring the app's `SourcePluginConfig`
 * deserializer field-for-field. Every field the app accepts is represented;
 * validation warns on values the app would reject or misinterpret.
 */

/** Engine packages a plugin may request. */
export type EnginePackageName = "Http" | "HttpImp" | "DOMParser" | "JSDOM" | "Utilities" | "Browser";

/**
 * Settings rendered in the app's plugin settings screen.
 * `type` values observed in official plugins: Header, Boolean, Dropdown,
 * plus free-form text types on older builds.
 */
export interface PluginSetting {
  /** Setting name shown to the user. */
  name: string;
  description: string;
  type: string;
  /** Default value as a string (app JSON-parses it when passing to enable). */
  default?: string | null;
  /** Variable name in `settings` passed to `source.enable`; defaults to `name`. */
  variable?: string | null;
  /** Only show this setting when the referenced setting is truthy. */
  dependency?: string | null;
  /** Show a confirmation dialog with this text before changing the value. */
  warningDialog?: string | null;
  /** Dropdown options (values as strings). */
  options?: string[] | null;
  isAdvanced?: boolean | null;
}

export interface AuthWarning {
  /** Regex the login url is matched against. */
  url: string;
  text?: string | null;
  details?: string | null;
  once?: boolean | null;
}

export interface AuthUIMod {
  /** Regex selecting pages this mod applies to. */
  url: string;
  scale?: number | null;
  desktop?: boolean | null;
}

export interface SourcePluginAuthConfig {
  /** Initial url of the login browser. */
  loginUrl: string;
  /** Url that must be visited before login is considered complete. */
  completionUrl?: string | null;
  allowedDomains?: string[] | null;
  headersToFind?: string[] | null;
  cookiesToFind?: string[] | null;
  cookiesExclOthers?: boolean | null;
  userAgent?: string | null;
  /** CSS selector for an element to click when the page loads. */
  loginButton?: string | null;
  /** Headers to capture per domain (e.g. `{ ".platform.com": ["authorization"] }`). */
  domainHeadersToFind?: Record<string, string[]> | null;
  loginWarning?: string | null;
  loginWarnings?: AuthWarning[] | null;
  uiMods?: AuthUIMod[] | null;
}

export interface SourcePluginCaptchaConfig {
  captchaUrl?: string | null;
  completionUrl?: string | null;
  cookiesToFind?: string[] | null;
  userAgent?: string | null;
  cookiesExclOthers?: boolean | null;
}

/**
 * The plugin config (`*Config.json`) served at your `sourceUrl`.
 *
 * Required by the app: `name`, `version`, `id`, `scriptUrl` (relative urls
 * resolve against the config's own url). The build tool fills `scriptUrl`,
 * `iconUrl`, `scriptSignature` and `scriptPublicKey` for you.
 */
export interface SourcePluginConfig {
  name: string;
  description?: string;

  author?: string;
  authorUrl?: string;

  repositoryUrl?: string | null;
  /** Relative to the config file; set by `gj build`. */
  scriptUrl?: string;
  /** Integer version; must increase on every release. */
  version: number;
  iconUrl?: string | null;

  /** UUID v4 identifying the plugin across updates. */
  id: string;

  /** Base64 RSA signature over the script bytes; set by `gj build --sign`. */
  scriptSignature?: string | null;
  /** Base64 X.509 SubjectPublicKeyInfo (SPKI) DER public key. */
  scriptPublicKey?: string | null;

  allowEval?: boolean;
  /** Domains the plugin may access, or `["everywhere"]` (warns the user). */
  allowUrls?: string[];
  packages?: EnginePackageName[];
  packagesOptional?: EnginePackageName[];

  settings?: PluginSetting[];
  captcha?: SourcePluginCaptchaConfig | null;
  authentication?: SourcePluginAuthConfig | null;
  /** Where this config is published; the app polls it for updates. */
  sourceUrl?: string | null;
  /** Injected as global JS constants before your script runs. */
  constants?: Record<string, string>;

  platformUrl?: string | null;
  subscriptionRateLimit?: number | null;
  enableInSearch?: boolean;
  enableInHome?: boolean;
  enableInShorts?: boolean;
  supportedClaimTypes?: number[];
  primaryClaimFieldType?: number | null;
  developerSubmitUrl?: string | null;
  allowAllHttpHeaderAccess?: boolean;
  maxDownloadParallelism?: number;
  reduceFunctionsInLimitedVersion?: boolean;
  /** Version string → changelog lines. */
  changelog?: Record<string, string[]> | null;
}

export const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
