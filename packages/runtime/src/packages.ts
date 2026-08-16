/**
 * Types for the engine-injected packages (`config.packages`):
 * Http, Utilities, DOMParser — plus `bridge`, which is always available.
 *
 * Method surface mirrors the Android engine packages:
 *   PackageHttp.kt, PackageBridge.kt, PackageUtilities.kt, PackageDOMParser.kt
 */

import type { ByteArray } from "./types.js";

/* ============================================================================
 * Http package (config packages: ["Http"])
 * ========================================================================== */

/** Response returned by every http method. */
export interface BridgeHttpResponse {
  /** HTTP status code. */
  code: number;
  /** Raw body as text. */
  body: string;
  headers: Record<string, string>;
  /** Convenience: `code` in 200..299. */
  isOk: boolean;
  /** Request url after redirects. */
  url: string;
}

export type HttpHeaders = Record<string, string>;

export interface HttpPackage {
  /** GET a url. */
  GET(url: string, headers?: HttpHeaders, useAuthClient?: boolean): BridgeHttpResponse;
  /** POST a url with a body. */
  POST(url: string, body: string, headers?: HttpHeaders, useAuthClient?: boolean): BridgeHttpResponse;
  /** Arbitrary method without a body. */
  request(method: string, url: string, headers?: HttpHeaders, useAuthClient?: boolean): BridgeHttpResponse;
  /** Arbitrary method with a body. */
  requestWithBody(
    method: string,
    url: string,
    body: string,
    headers?: HttpHeaders,
    useAuthClient?: boolean,
  ): BridgeHttpResponse;
  /**
   * Start a batch of requests executed concurrently.
   * `.execute()` returns responses in call order.
   */
  batch(): BatchBuilder;
  /** Create an isolated client (own cookies/headers), optionally auth-backed. */
  newClient(useAuthClient?: boolean): HttpClient;
  /** Open a websocket; only on engines advertising websocket support. */
  websocket?(url: string, headers?: HttpHeaders, useAuthClient?: boolean): WebSocketClient;
}

export interface HttpClient {
  GET(url: string, headers?: HttpHeaders): BridgeHttpResponse;
  POST(url: string, body: string, headers?: HttpHeaders): BridgeHttpResponse;
  request(method: string, url: string, headers?: HttpHeaders): BridgeHttpResponse;
  requestWithBody(method: string, url: string, body: string, headers?: HttpHeaders): BridgeHttpResponse;
  batch(): BatchBuilder;
  /** Headers appended to every request. */
  setDefaultHeaders(headers: HttpHeaders): void;
  setDoApplyCookies(apply: boolean): void;
  setDoUpdateCookies(update: boolean): void;
  setDoAllowNewCookies(allow: boolean): void;
}

export interface BatchBuilder {
  GET(url: string, headers?: HttpHeaders, useAuthClient?: boolean): BatchBuilder;
  POST(url: string, body: string, headers?: HttpHeaders, useAuthClient?: boolean): BatchBuilder;
  request(method: string, url: string, headers?: HttpHeaders, useAuthClient?: boolean): BatchBuilder;
  requestWithBody(method: string, url: string, body: string, headers?: HttpHeaders, useAuthClient?: boolean): BatchBuilder;
  /** Run on a specific custom client. */
  clientGET(client: HttpClient, url: string, headers?: HttpHeaders): BatchBuilder;
  clientPOST(client: HttpClient, url: string, body: string, headers?: HttpHeaders): BatchBuilder;
  /** Execute all queued requests concurrently; responses in call order. */
  execute(): BridgeHttpResponse[];
}

export interface WebSocketClient {
  send(message: string): void;
  close(): void;
  onOpen?(callback: () => void): void;
  onClose?(callback: () => void): void;
  onMessage?(callback: (message: string) => void): void;
  onError?(callback: (message: string) => void): void;
}

/* ============================================================================
 * Bridge package (always available)
 * ========================================================================== */

export interface BridgePackage {
  /** App version code. Debug builds report Int.MAX_VALUE. */
  readonly buildVersion: number;
  readonly buildFlavor: string;
  /** Plugin spec version the app implements. */
  readonly buildSpecVersion: number;
  /** `"android"`, `"desktop"`, … */
  readonly buildPlatform: string;
  /** Features this app build supports (e.g. "HttpBatchClient", "UMPSource"). */
  readonly supportedFeatures: string[];
  /** Content types this app build understands. */
  readonly supportedContent: number[];
  readonly captchaUserAgent: string | null;
  readonly authUserAgent: string | null;
  log(message: string): void;
  toast(message: string): void;
  sleep(ms: number): void;
  setTimeout(callback: () => void, ms?: number): number;
  clearTimeout(id: number): void;
  hasPackage(name: string): boolean;
  isLoggedIn(): boolean;
  /** Hardware decoder names, e.g. `OMX.google.avc.decoder`. */
  getHardwareCodecs(): string[];
  dispose(value: unknown): void;
}

/* ============================================================================
 * Utilities package (config packages: ["Utilities"])
 * ========================================================================== */

export interface UtilitiesPackage {
  /** Base64 without padding/wrapping. */
  toBase64(data: ByteArray): string;
  fromBase64(data: string): ByteArray;
  md5(data: ByteArray): ByteArray;
  md5String(data: string): string;
  sha256(data: ByteArray): ByteArray;
  sha256String(data: string): string;
  randomUUID(): string;
}

/* ============================================================================
 * DOMParser package (config packages: ["DOMParser"])
 * ========================================================================== */

/** Jsoup-backed HTML node (not a standard DOM Node). */
export interface DOMNode {
  readonly nodeType: string;
  readonly childNodes: DOMNode[];
  readonly firstChild: DOMNode | null;
  readonly lastChild: DOMNode | null;
  readonly parentNode: DOMNode | null;
  readonly parentElement: DOMNode | null;
  readonly attributes: Record<string, string>;
  readonly innerHTML: string;
  readonly outerHTML: string;
  readonly textContent: string;
  readonly tagName: string;
  readonly text: string;
  readonly data: string;
  readonly classList: string[];
  readonly className: string;
  getAttribute(key: string): string;
  getElementById(id: string): DOMNode | null;
  getElementsByClassName(className: string): DOMNode[];
  getElementsByTagName(tagName: string): DOMNode[];
  getElementsByName(name: string): DOMNode[];
  /** CSS selector (Jsoup syntax). */
  querySelector(query: string): DOMNode | null;
  querySelectorAll(query: string): DOMNode[];
  dispose(): void;
}

export interface DomParserPackage {
  parseFromString(html: string): DOMNode;
}
