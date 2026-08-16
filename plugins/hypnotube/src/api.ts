/**
 * Typed hypnotube.com client.
 *
 * The site is server-rendered HTML (mechbunny) behind an age gate:
 *   GET  anything                   → 302 /age-gate?return=… (sets PHPSESSID)
 *   POST /age-gate {"return":"/"}    → marks the session as verified
 *   GET  …                           → 200 (while the same PHPSESSID is sent)
 *
 * The gate state lives server-side on the PHPSESSID, so this client tracks
 * that cookie manually (Cookie header) instead of relying on engine cookie
 * management — deterministic and testable.
 *
 * Endpoints (verified against the live site):
 *   GET /most-recent|top-rated|most-discussed|most-viewed[/day|week|month]/[pageN.html]
 *   GET /search/videos/<q>[/newest|rating|views]/[pageN.html]
 *   GET /video/<slug>-<id>.html
 *   GET /templates/hypnotube/template.ajax_comments.php?id=<id>
 *   GET /user/<name>-<id>/, /uploads-by-user/<id>/[pageN.html]
 *   GET /playlist/<id>/<slug>/[pageN.html]
 */

import type { DOMNode } from "@grayjay/runtime";

export const BASE = "https://hypnotube.com";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Session cookie captured from Set-Cookie (PHPSESSID). */
let sessionCookie: string | undefined;
/** Set once a request succeeded without hitting the age gate. */
let gateVerified = false;

function setCookieFrom(resp: { headers: Record<string, string> }): void {
  for (const [key, value] of Object.entries(resp.headers)) {
    if (key.toLowerCase() !== "set-cookie") continue;
    const match = value.match(/(PHPSESSID=[^;]+)/i);
    if (match?.[1]) sessionCookie = match[1];
  }
}

function baseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { "user-agent": UA, accept: "text/html,*/*" };
  if (sessionCookie) headers["Cookie"] = sessionCookie;
  return { ...headers, ...extra };
}

function isAgeGate(resp: { url: string; body: string }): boolean {
  return resp.url.includes("/age-gate") || resp.body.includes("Checking access");
}

/** Pass the age gate once for the current session (returns false on failure). */
function passAgeGate(): boolean {
  const resp = http.requestWithBody(
    "POST",
    `${BASE}/age-gate`,
    JSON.stringify({ return: "/" }),
    baseHeaders({ "Content-Type": "application/json", "X-Requested-With": "fetch" }),
    false,
  );
  setCookieFrom(resp);
  // NOTE: the POST response url is /age-gate itself, so only the body may be
  // inspected here — and the JSON answer never carries a gate page.
  if (!resp.isOk) return false;
  try {
    return (JSON.parse(resp.body) as { blocked?: boolean }).blocked !== true;
  } catch {
    return true;
  }
}

/** GET a page, transparently establishing a session and passing the age gate. */
export function fetchHtml(url: string): string {
  let resp = http.GET(url, baseHeaders(), false);
  setCookieFrom(resp);
  if (resp.isOk && !isAgeGate(resp)) {
    gateVerified = true;
    return resp.body;
  }

  if (!passAgeGate()) {
    throw new ScriptException(`Could not pass the age gate for ${url}`);
  }
  resp = http.GET(url, baseHeaders(), false);
  setCookieFrom(resp);
  if (!resp.isOk) {
    if (resp.code === 404) throw new UnavailableException(`Not found: ${url}`);
    throw new ScriptException(`Request failed (${resp.code}) for ${url}`);
  }
  if (isAgeGate(resp)) throw new ScriptException(`Age gate persisted for ${url}`);
  gateVerified = true;
  return resp.body;
}

/**
 * Make sure the session is gate-verified before a non-GET flow (the search
 * POST's redirect landing must not burn the one render on a gate page).
 */
function ensureGateVerified(): void {
  if (gateVerified) return;
  fetchHtml(`${BASE}/`);
}

/** Reset the session (used by tests). */
export function resetSession(): void {
  sessionCookie = undefined;
  gateVerified = false;
}

/* ============================================================================
 * URL and id helpers
 * ========================================================================== */

/** Grid pages paginate by appending pageN.html to the bare listing url. */
export function pageUrl(listingUrl: string, page: number): string {
  const base = listingUrl.endsWith("/") ? listingUrl : `${listingUrl}/`;
  return page <= 1 ? base : `${base}page${page}.html`;
}

export function videoIdFromUrl(url: string): string | undefined {
  return url.match(/-(\d+)\.html?/)?.[1];
}

export function isVideoUrl(url: string): boolean {
  return /^https?:\/\/(?:www\.|m\.)?hypnotube\.com\/video\/[^/]+\.html?(?:[?#].*)?$/i.test(url);
}

export function isUserUrl(url: string): boolean {
  return /^https?:\/\/(?:www\.|m\.)?hypnotube\.com\/user\/[a-z0-9_-]+-\d+\/?(?:[?#].*)?$/i.test(url);
}

export function isPlaylistUrl(url: string): boolean {
  return /^https?:\/\/(?:www\.|m\.)?hypnotube\.com\/playlist\/\d+\/[^/]+\/?(?:[?#].*)?$/i.test(url);
}

/** "…/user/niqqadick-284360/" → "284360" */
export function userIdFromUrl(url: string): string | undefined {
  return url.match(/\/user\/[a-z0-9_-]+-(\d+)/i)?.[1];
}

/* ============================================================================
 * DOM helpers
 * ========================================================================== */

export function parse(html: string): DOMNode {
  return domParser.parseFromString(html);
}

function text(node: DOMNode | null | undefined): string {
  return (node?.text ?? "").trim();
}

function attr(node: DOMNode | null | undefined, name: string): string | undefined {
  const value = node?.getAttribute(name);
  return value ? value.trim() : undefined;
}

function intFrom(value: string | undefined): number {
  if (!value) return -1;
  const parsed = Number.parseInt(value.replace(/[.,\s]/g, ""), 10);
  return Number.isNaN(parsed) ? -1 : parsed;
}

/** "05:03" / "1:02:03" → seconds; -1 when unparseable. */
export function parseDuration(value: string | undefined): number {
  if (!value) return -1;
  const parts = value.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.length < 2 || parts.some((n) => Number.isNaN(n))) return -1;
  return parts.reduce((acc, part) => acc * 60 + part, 0);
}

/** Site dates are "YYYY-MM-DD HH:mm:ss"; treated as UTC to be deterministic. */
export function parseDate(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value.trim().replace(" ", "T") + "Z");
  return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
}

/** "46 mins ago", "1 hr ago", "2 days ago" → approximate unix time. */
export function parseRelativeDate(value: string | undefined): number {
  if (!value) return 0;
  const match = value.match(/(\d+)\s*(sec|min|hr|hour|day|week|month|year)/i);
  if (!match) return parseDate(value);
  const amount = Number.parseInt(match[1]!, 10);
  const unit = match[2]!.toLowerCase();
  const seconds: Record<string, number> = {
    sec: 1,
    min: 60,
    hr: 3600,
    hour: 3600,
    day: 86400,
    week: 604800,
    month: 2592000,
    year: 31536000,
  };
  const factor = seconds[unit];
  return factor ? Math.floor(Date.now() / 1000) - amount * factor : 0;
}

/* ============================================================================
 * Video grids (feeds, search, user uploads, playlists, related)
 * ========================================================================== */

export interface FeedItem {
  url: string;
  id: string;
  title: string;
  thumbnail?: string;
  duration: number;
  viewCount: number;
  /** Rating percent 0..100 when shown. */
  ratingPercent?: number;
}

/**
 * Video grid items are `div.item-col` without the `item--channel` modifier
 * (that one is category tiles). Scoped to the main column when present so
 * sidebar/header grids don't leak in.
 */
export function parseVideoGrid(html: string): FeedItem[] {
  const dom = parse(html);
  const scope = dom.querySelector(".main-inner-col") ?? dom;
  const items: FeedItem[] = [];
  for (const item of scope.querySelectorAll(".item-col")) {
    if ((item.classList ?? []).includes("item--channel")) continue;
    const link = item.querySelector("a");
    const href = attr(link, "href");
    if (!href || !/\/video\//.test(href)) continue;
    const img = item.querySelector("img");
    const title = attr(link, "title") || attr(img, "alt") || text(item.querySelector(".title")) || "Untitled";
    const id = videoIdFromUrl(href) ?? href;
    items.push({
      url: absolute(href),
      id,
      title,
      thumbnail: attr(img, "src") ?? attr(img, "data-src"),
      duration: parseDuration(text(item.querySelector(".time"))),
      viewCount: intFrom(text(item.querySelector(".s-e-views .sub-desc"))),
      ratingPercent: (() => {
        const pct = text(item.querySelector(".s-e-rate .sub-desc"));
        const parsed = pct ? Number.parseInt(pct, 10) : NaN;
        return Number.isNaN(parsed) ? undefined : parsed;
      })(),
    });
  }
  return items;
}

export function absolute(href: string): string {
  return href.startsWith("http") ? href : `${BASE}${href.startsWith("/") ? "" : "/"}${href}`;
}

/** True when the page reports an empty result (used to stop pagination). */
export function isEmptyResults(html: string): boolean {
  return (
    html.includes("Sorry, no results were found") ||
    html.includes("Search error") ||
    html.includes("Search expired")
  );
}

/* ============================================================================
 * Feeds
 * ========================================================================== */

export type FeedSort = "most-recent" | "top-rated" | "most-discussed" | "most-viewed";
export type FeedPeriod = "" | "day" | "week" | "month";

export function feedUrl(sort: FeedSort, period: FeedPeriod): string {
  return period ? `${BASE}/${sort}/${period}/` : `${BASE}/${sort}/`;
}

/* ============================================================================
 * Search
 * ========================================================================== */

export type SearchSort = "" | "newest" | "rating" | "views";

export function searchUrl(query: string, sort: SearchSort): string {
  const q = encodeURIComponent(query.trim());
  return sort ? `${BASE}/search/videos/${q}/${sort}/` : `${BASE}/search/videos/${q}/`;
}

/**
 * Search results are tied to a server-side search session: a direct GET of
 * /search/videos/<q>/ answers "Search expired". The site's form POSTs to
 * searchgate.php, which 302s to the search url — the engine follows that
 * redirect, so the POST response IS the first results page.
 *
 * Empirically (probed with curl/bun): the redirect landing always renders the
 * first page; follow-up pageN.html GETs usually work but are throttled when
 * bursty or repeated (empty grid), so the pager paces and retries them.
 */
export function startSearch(query: string): { body: string; ok: boolean } {
  ensureGateVerified();
  const resp = http.requestWithBody(
    "POST",
    `${BASE}/searchgate.php`,
    `q=${encodeURIComponent(query)}&type=videos`,
    baseHeaders({ "Content-Type": "application/x-www-form-urlencoded" }),
    false,
  );
  setCookieFrom(resp);
  return { body: resp.body, ok: resp.isOk };
}

/* ============================================================================
 * Video details page
 * ========================================================================== */

export interface VideoSource {
  url: string;
  height: number;
  container: string;
}

export interface VideoPage {
  url: string;
  id: string;
  title: string;
  thumbnail?: string;
  description: string;
  uploadDate: number;
  duration: number;
  viewCount: number;
  ratingPercent: number;
  voteCount: number;
  tags: string[];
  sources: VideoSource[];
  author?: { url: string; id: string; name: string; avatar?: string };
  related: FeedItem[];
}

/** Fetch and decode a video page. */
export function fetchVideoPage(url: string): VideoPage {
  const html = fetchHtml(url);
  const id = videoIdFromUrl(url) ?? url;
  const dom = parse(html);
  const scope = dom.querySelector(".content-inner-col") ?? dom;

  const title =
    text(scope.querySelector(".item-tr-col h1")) ||
    attr(dom.querySelector('meta[property="og:title"]'), "content") ||
    "Untitled";
  const thumbnail =
    attr(dom.querySelector('meta[property="og:image"]'), "content") ??
    attr(scope.querySelector(".related-col img"), "src");

  // Stats row: clock → duration, eye → views, calendar → upload date.
  let duration = -1;
  let viewCount = -1;
  let uploadDate = 0;
  for (const li of scope.querySelectorAll(".stats-list li")) {
    const label = text(li.querySelector(".sub-label"));
    if (li.querySelector(".i-clock")) duration = parseDuration(label);
    else if (li.querySelector(".i-eye")) viewCount = intFrom(label);
    else if (li.querySelector(".i-calendar")) uploadDate = parseDate(label);
  }

  const ratingPercent = intFrom(text(scope.querySelector(".vote-count")));
  const voteText = text(scope.querySelector(".vote-summary-count"));
  const voteCount = voteText ? intFrom(voteText.replace(/[()]/g, "")) : -1;

  const description =
    attr(dom.querySelector('meta[name="description"]'), "content") ??
    text(scope.querySelector(".main-description"));
  const tags = scope
    .querySelector(".tags-block")
    ?.querySelectorAll("a")
    .map((a) => text(a))
    .filter(Boolean) ?? [];

  const sources: VideoSource[] = [];
  for (const source of scope.querySelectorAll("video source")) {
    const src = attr(source, "src");
    if (!src) continue;
    const height = intFrom(attr(source, "sizes")) || 480;
    sources.push({ url: src, height, container: attr(source, "type") ?? "video/mp4" });
  }
  if (sources.length === 0) throw new UnavailableException(`No playable video source on ${url}`);

  let author: VideoPage["author"];
  const authorLink = scope.querySelector("a.name_normal");
  if (authorLink) {
    const authorUrl = attr(authorLink, "href");
    if (authorUrl) {
      // .user-name text includes a "Submitted by" label; the anchor title is clean.
      author = {
        url: absolute(authorUrl),
        id: userIdFromUrl(absolute(authorUrl)) ?? absolute(authorUrl),
        name: attr(authorLink, "title") || text(authorLink.querySelector(".user-name")).replace(/^Submitted by/i, "").trim() || "unknown",
        avatar: attr(authorLink.querySelector("img"), "src"),
      };
    }
  }

  const relatedScope = dom.querySelector(".reltated-sec") ?? dom;
  const relatedHtml = relatedScope.outerHTML;

  return {
    url,
    id,
    title,
    thumbnail,
    description,
    uploadDate,
    duration,
    viewCount,
    ratingPercent: ratingPercent < 0 ? 0 : ratingPercent,
    voteCount,
    tags,
    sources,
    author,
    related: parseVideoGrid(relatedHtml),
  };
}

/** The uploader's grid page — fallback recommendations when a video has none. */
export function uploaderVideos(authorUrl: string): FeedItem[] {
  const id = userIdFromUrl(authorUrl);
  if (!id) return [];
  return parseVideoGrid(fetchHtml(`${BASE}/uploads-by-user/${id}/`));
}

/* ============================================================================
 * Comments
 * ========================================================================== */

export interface SiteComment {
  authorName: string;
  authorUrl?: string;
  avatar?: string;
  message: string;
  date: number;
}

export function fetchComments(videoUrl: string): SiteComment[] {
  const id = videoIdFromUrl(videoUrl);
  if (!id) throw new ScriptException(`Not a hypnotube video url: ${videoUrl}`);
  const html = fetchHtml(`${BASE}/templates/hypnotube/template.ajax_comments.php?id=${id}`);
  if (html.includes("There are no comments for this video")) return [];
  if (html.trim() === "") return [];

  const dom = parse(html);
  const comments: SiteComment[] = [];
  for (const li of dom.querySelectorAll("li")) {
    const nameNode = li.querySelector("strong");
    const message = li.querySelector("p");
    if (!nameNode || !message) continue;
    const authorUrl = attr(li.querySelector("a"), "href");
    comments.push({
      authorName: text(nameNode) || "anonymous",
      authorUrl: authorUrl ? absolute(authorUrl) : undefined,
      avatar: attr(li.querySelector("img"), "src"),
      message: text(message),
      date: parseRelativeDate(li.textContent.match(/wrote ([^:]+):/)?.[1]),
    });
  }
  return comments;
}

/* ============================================================================
 * Channels
 * ========================================================================== */

export interface SiteUser {
  url: string;
  id: string;
  name: string;
  avatar?: string;
  uploadsUrl: string;
}

export function fetchUser(url: string): SiteUser {
  const html = fetchHtml(url);
  const dom = parse(html);
  const img = dom.querySelector(".profile-img-avatar img");
  const name =
    text(dom.querySelector(".profile-field-username .sub-desc")) || attr(img, "alt") || "unknown";
  const id = userIdFromUrl(url) ?? url;
  return {
    url,
    id,
    name,
    avatar: attr(img, "src"),
    uploadsUrl: `${BASE}/uploads-by-user/${id}/`,
  };
}

export function userUploadsUrl(url: string): string {
  const id = userIdFromUrl(url);
  if (!id) throw new ScriptException(`Not a hypnotube user url: ${url}`);
  return `${BASE}/uploads-by-user/${id}/`;
}

/* ============================================================================
 * Playlists
 * ========================================================================== */

export interface SitePlaylist {
  url: string;
  id: string;
  name: string;
  thumbnail?: string;
  videoCount: number;
}

export function fetchPlaylist(url: string): { playlist: SitePlaylist; videos: FeedItem[] } {
  const html = fetchHtml(url);
  const dom = parse(html);
  const scope = dom.querySelector(".main-inner-col") ?? dom;
  const name = text(scope.querySelector("h1")) || "Playlist";
  const videos = parseVideoGrid(html);
  return {
    playlist: {
      url,
      id: url.match(/\/playlist\/(\d+)\//)?.[1] ?? url,
      name,
      thumbnail: videos[0]?.thumbnail,
      videoCount: videos.length,
    },
    videos,
  };
}
