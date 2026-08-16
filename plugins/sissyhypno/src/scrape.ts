/**
 * Scraping layer for sissyhypno.com (server-rendered HTML, KVS-style template).
 *
 * All requests go through the engine's synchronous `http` package; HTML is
 * parsed with the engine's `domParser` package (Jsoup-flavored DOMNode).
 */

export const PLATFORM = "Sissyhypno";
export const BASE = "https://sissyhypno.com";

export interface ScrapedVideo {
  url: string;
  id: string;
  title: string;
  thumbnail: string;
  duration: number;
  viewCount: number;
  ratingPercent: number;
}

export interface ScrapedVideoDetails extends ScrapedVideo {
  description: string;
  datetime: number | null;
  ratingVotes: number;
  videoUrl: string;
  container: string;
  sourceTitle: string;
  author: { url: string; name: string; thumbnail: string } | null;
  tags: { name: string; url: string }[];
  categories: { name: string; url: string }[];
  related: ScrapedVideo[];
}

export interface ScrapedChannel {
  url: string;
  id: string;
  name: string;
  thumbnail: string;
  fields: { label: string; value: string }[];
}

export interface ScrapedComment {
  authorName: string;
  authorUrl: string;
  authorThumbnail: string;
  message: string;
  date: number | null;
}

/** GET a page and parse it, throwing ScriptException on transport failures. */
export function fetchDoc(url: string): DOMNode {
  const res = http.GET(url, {}, false);
  if (!res.isOk) throw new ScriptException(`Error trying to load '${url}' (${res.code})`);
  return domParser.parseFromString(res.body);
}

export function isVideoUrl(url: string): boolean {
  return /(^|\.)sissyhypno\.com\/video\/[^/]+\.html/.test(url.replace("https://", "").replace("http://", ""));
}

export function isChannelUrl(url: string): boolean {
  return /(^|\.)sissyhypno\.com\/user\/[^/]+/.test(url.replace("https://", "").replace("http://", ""));
}

/** Stable numeric id from a slug url like /video/sissy-hypno-slut-...-16461966.html */
export function videoIdFromUrl(url: string): string | null {
  const match = url.match(/-(\d+)\.html?(?:[/?#]|$)/) ?? url.match(/video\/.*?(\d+)\.html/);
  return match?.[1] ?? null;
}

/** Numeric user id from /user/<name>-<id>/. */
export function userIdFromUrl(url: string): string | null {
  const match = url.match(/\/user\/[^/]*?-(\d+)\/?/);
  return match?.[1] ?? null;
}

function parseDuration(text: string): number {
  const parts = text.trim().split(":").map((p) => Number.parseInt(p, 10));
  if (parts.some((p) => !Number.isInteger(p))) return -1;
  return parts.reduce((acc, p) => acc * 60 + (p ?? 0), 0);
}

function parseViews(text: string): number {
  const cleaned = text.replace(/[,.]/g, "").match(/\d+/);
  const value = cleaned ? Number.parseInt(cleaned[0]!, 10) : -1;
  return value;
}

/** "2026-08-16 12:36:48" (site-local) -> unix seconds (treated as UTC for determinism). */
function parseSiteDate(text: string): number | null {
  const m = text.trim().match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return Math.floor(Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s!) / 1000);
}

/** "wrote 69 days ago" / "wrote 3 hours ago" -> approximate unix seconds. */
export function parseRelativeDate(text: string): number | null {
  const now = Math.floor(Date.now() / 1000);
  const m = text.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago/i);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  const unit = m[2]!.toLowerCase();
  const secs: Record<string, number> = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };
  return now - n * (secs[unit] ?? 0);
}

function textOf(node: DOMNode | null): string {
  return node?.text ?? node?.textContent ?? "";
}

function attr(node: DOMNode | null, name: string): string {
  return node?.getAttribute?.(name) ?? "";
}

function firstInnerText(node: DOMNode, selector: string): string {
  return textOf(node.querySelector(selector)).trim();
}

/** Parse one grid `.item-col` (video cards; channel cards are filtered out). */
function parseItem(item: DOMNode): ScrapedVideo | null {
  const link = item.querySelector("a[href*='/video/']");
  if (!link) return null;
  const img = item.querySelector("img");
  if (!img) return null;

  const url = attr(link, "href");
  const durationText = firstInnerText(item, ".time");
  const viewsText = firstInnerText(item, ".s-e-views .sub-desc");
  const rateText = firstInnerText(item, ".s-e-rate .sub-desc");

  return {
    url,
    id: videoIdFromUrl(url) ?? url,
    title: attr(link, "title") || attr(img, "alt") || firstInnerText(item, ".title"),
    thumbnail: attr(img, "src"),
    duration: durationText ? parseDuration(durationText) : -1,
    viewCount: viewsText ? parseViews(viewsText) : -1,
    ratingPercent: rateText ? (Number.parseInt(rateText, 10) || 0) : 0,
  };
}

export function parseVideos(root: DOMNode): ScrapedVideo[] {
  const out: ScrapedVideo[] = [];
  for (const item of root.querySelectorAll("div.item-col")) {
    const video = parseItem(item);
    if (video) out.push(video);
  }
  return out;
}

/**
 * Fetch one page of any paginated grid feed (home categories, search,
 * uploader uploads). Page 1 is the bare base url, page N > 1 appends
 * `pageN.html`. Returns null when the grid reports no results (end of feed).
 */
export function fetchFeedPage(baseUrl: string, page: number): ScrapedVideo[] | null {
  const url = page <= 1 ? ensureSlash(baseUrl) : `${ensureSlash(baseUrl)}page${page}.html`;
  const res = http.GET(url, {}, false);
  if (!res.isOk) throw new ScriptException(`Error trying to load '${url}' (${res.code})`);
  if (res.body.includes("Sorry, no results were found.")) return null;
  if (res.body.includes("Search error, please use the search box at the top of the page.")) {
    throw new ScriptException("Search error, please use the search box at the top of the page.");
  }
  const dom = domParser.parseFromString(res.body);
  return parseVideos(dom);
}

function ensureSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

export function searchUrl(query: string): string {
  return `${BASE}/search/${encodeURIComponent(query).replace(/%20/g, "-")}/`;
}

const videoDetailCache = new Map<string, ScrapedVideoDetails>();

/** Scrape (and cache) a video detail page. */
export function fetchVideoDetails(url: string): ScrapedVideoDetails {
  const cached = videoDetailCache.get(url);
  if (cached) return cached;

  const dom = fetchDoc(url);

  const source = dom.querySelector("video source");
  const videoUrl = attr(source, "src");
  if (!videoUrl) throw new ScriptException(`No video source found on '${url}'`);

  const meta = (property: string): string =>
    dom.querySelectorAll("meta[property]").find((m) => attr(m, "property") === property)?.getAttribute("content") ?? "";
  const thumbnail = meta("og:image") || attr(dom.querySelector("div.image img, .vtt-thumbs img"), "src");

  // Stats row: duration (clock), views (eye), upload date (calendar).
  let duration = -1;
  let viewCount = -1;
  let datetime: number | null = null;
  for (const li of dom.querySelectorAll(".stats-list li")) {
    const label = textOf(li).trim();
    if (li.querySelector(".i-clock")) duration = parseDuration(label);
    else if (li.querySelector(".i-eye")) viewCount = parseViews(label);
    else if (li.querySelector(".i-calendar")) datetime = parseSiteDate(label);
  }

  // Uploader: .submitter-container a (avatar img + "Submitted by <name>").
  let author: ScrapedVideoDetails["author"] = null;
  const submitter = dom.querySelector(".submitter-container a[href*='/user/']");
  if (submitter) {
    const name = textOf(submitter.querySelector(".user-name")).replace(/^\s*Submitted by\s*/i, "").trim();
    if (name) {
      author = {
        url: attr(submitter, "href"),
        name,
        thumbnail: attr(submitter.querySelector("img"), "src"),
      };
    }
  }

  // Tags + categories live in sibling .tags-block containers, told apart by icon.
  const tags: { name: string; url: string }[] = [];
  const categories: { name: string; url: string }[] = [];
  for (const block of dom.querySelectorAll(".tags-block")) {
    const target = block.querySelector(".i-folder") ? categories : tags;
    for (const a of block.querySelectorAll("a")) {
      const name = textOf(a).trim();
      const href = attr(a, "href");
      if (name && href) target.push({ name, url: href });
    }
  }

  const ratingVotes = Number.parseInt(textOf(dom.querySelector(".vote-summary-count")).replace(/[()]/g, ""), 10) || 0;
  const ratingPercent = Number.parseInt(textOf(dom.querySelector(".vote-count.score")), 10) || 0;

  const relatedRoot = dom.querySelector(".related-col");
  const related = relatedRoot ? parseVideos(relatedRoot) : [];

  const details: ScrapedVideoDetails = {
    url,
    id: videoIdFromUrl(url) ?? url,
    title: meta("og:title") || textOf(dom.querySelector(".item-tr-col h1")).trim() || "Untitled",
    thumbnail,
    duration,
    viewCount,
    ratingPercent,
    ratingVotes,
    datetime,
    description: meta("og:description") || firstInnerText(dom, ".main-description"),
    videoUrl,
    container: attr(source, "type") || "video/mp4",
    sourceTitle: attr(source, "title") || "Best Quality",
    author,
    tags,
    categories,
    related,
  };
  videoDetailCache.set(url, details);
  return details;
}

/** Scrape a user profile page. */
export function fetchChannel(url: string): ScrapedChannel {
  const dom = fetchDoc(url);
  const name = firstInnerText(dom, ".profile-field-username .sub-desc");
  if (!name) throw new ScriptException(`Could not parse channel '${url}'`);

  const fields: { label: string; value: string }[] = [];
  for (const li of dom.querySelectorAll(".profile-field")) {
    const label = textOf(li.querySelector(".sub-label")).replace(/:$/, "").trim();
    const value = textOf(li.querySelector(".sub-desc")).trim();
    if (label && value) fields.push({ label, value });
  }

  return {
    url,
    id: userIdFromUrl(url) ?? url,
    name,
    thumbnail: attr(dom.querySelector(".profile-img-avatar img"), "src"),
    fields,
  };
}

/** Fetch comments for a video via the site's ajax template. */
export function fetchComments(videoId: string): ScrapedComment[] {
  const url = `${BASE}/templates/default_tube2016/template.ajax_comments.php?id=${encodeURIComponent(videoId)}`;
  const res = http.GET(url, {}, false);
  if (!res.isOk) throw new ScriptException(`Error trying to load comments (${res.code})`);
  if (res.body.includes("no comments")) return [];

  const dom = domParser.parseFromString(res.body);
  const out: ScrapedComment[] = [];
  for (const li of dom.querySelectorAll("ul#ul-comments > li")) {
    const link = li.querySelector("a[href*='/user/']");
    const name = textOf(li.querySelector("strong")).trim();
    const message = textOf(li.querySelector("p")).trim();
    if (!name && !message) continue;
    out.push({
      authorName: name,
      authorUrl: attr(link, "href"),
      authorThumbnail: attr(li.querySelector("img"), "src"),
      message,
      date: parseRelativeDate(textOf(li.querySelector(".block"))),
    });
  }
  return out;
}
