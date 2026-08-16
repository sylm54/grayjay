/**
 * Realm-safe contract assertions.
 *
 * Plugin objects come from the harness's vm context, so `instanceof` checks
 * from your test file do not apply. These helpers assert what the app
 * actually reads off the wire: `plugin_type` discriminators and field shapes.
 */

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown, what: string): UnknownRecord {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${what}: expected object, got ${describe(value)}`);
  }
  return value as UnknownRecord;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "object") {
    const pluginType = (value as UnknownRecord)["plugin_type"];
    return pluginType ? String(pluginType) : Object.prototype.toString.call(value);
  }
  return `${typeof value} (${JSON.stringify(value)?.slice(0, 80)})`;
}

function expectString(record: UnknownRecord, field: string, what: string): string {
  const value = record[field];
  if (typeof value !== "string") throw new Error(`${what}: .${field} must be a string, got ${describe(value)}`);
  return value;
}

function expectNumber(record: UnknownRecord, field: string, what: string): number {
  const value = record[field];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${what}: .${field} must be a number, got ${describe(value)}`);
  }
  return value;
}

function expectBoolean(record: UnknownRecord, field: string, what: string): boolean {
  const value = record[field];
  if (typeof value !== "boolean") throw new Error(`${what}: .${field} must be a boolean, got ${describe(value)}`);
  return value;
}

const PAGER_KINDS = ["ContentPager", "VideoPager", "ChannelPager", "PlaylistPager", "CommentPager", "LiveEventPager"] as const;
export type PagerKind = (typeof PAGER_KINDS)[number];

/** Assert the value is a pager of the given kind (or any kind when omitted). */
export function expectPager(
  value: unknown,
  kind?: PagerKind,
): { results: UnknownRecord[]; hasMore: boolean; context: UnknownRecord; nextPage?: () => unknown } {
  const pager = asRecord(value, "pager");
  const pluginType = String(pager["plugin_type"] ?? "");
  if (kind) {
    if (pluginType !== kind) throw new Error(`pager: expected plugin_type=${kind}, got ${describe(value)}`);
  } else if (!PAGER_KINDS.includes(pluginType as PagerKind)) {
    throw new Error(`pager: expected one of ${PAGER_KINDS.join("|")}, got ${describe(value)}`);
  }
  if (!Array.isArray(pager.results)) throw new Error(`pager: .results must be an array`);
  if (typeof pager.hasMore !== "boolean") throw new Error(`pager: .hasMore must be a boolean`);
  if (typeof pager.nextPage !== "function") throw new Error(`pager: .nextPage must be a function (pagers must subclass)`);
  return pager as unknown as { results: UnknownRecord[]; hasMore: boolean; context: UnknownRecord; nextPage?: () => unknown };
}

const CONTENT_KINDS = new Set([
  "PlatformVideo",
  "PlatformVideoDetails",
  "PlatformPost",
  "PlatformPostDetails",
  "PlatformNestedMediaContent",
  "PlatformLockedContent",
  "PlatformPlaylist",
  "PlatformPlaylistDetails",
  "PlatformArticle",
  "PlatformArticleDetails",
  "PlatformWeb",
  "PlatformWebDetails",
  "PlatformChannel",
  "Comment",
]);

/** Assert the value looks like content the app can deserialize. */
export function expectContent(value: unknown): UnknownRecord {
  const content = asRecord(value, "content");
  const pluginType = String(content["plugin_type"] ?? "");
  if (!CONTENT_KINDS.has(pluginType)) {
    throw new Error(`content: unexpected plugin_type, got ${describe(value)}`);
  }
  expectString(content, "name", pluginType);
  expectString(content, "url", pluginType);
  const id = asRecord(content.id ?? null, `${pluginType}.id`);
  if (typeof id.value !== "string") throw new Error(`${pluginType}: .id.value must be a string`);
  return content;
}

/** Assert a feed video (or video details). */
export function expectVideo(value: unknown): UnknownRecord {
  const video = expectContent(value);
  const pluginType = String(video["plugin_type"]);
  if (pluginType !== "PlatformVideo" && pluginType !== "PlatformVideoDetails") {
    throw new Error(`expected PlatformVideo(Details), got ${describe(value)}`);
  }
  expectNumber(video, "duration", pluginType);
  expectBoolean(video, "isLive", pluginType);
  return video;
}

/** Assert a video details object, including its descriptor and sources. */
export function expectVideoDetails(value: unknown): {
  video: UnknownRecord & { videoSources: UnknownRecord[] };
  subtitles: UnknownRecord[];
  description: string;
} {
  const details = expectVideo(value);
  if (String(details["plugin_type"]) !== "PlatformVideoDetails") {
    throw new Error(`expected PlatformVideoDetails, got ${describe(value)}`);
  }
  expectString(details, "description", "PlatformVideoDetails");
  const descriptor = asRecord(details.video ?? null, "PlatformVideoDetails.video");
  if (!Array.isArray(descriptor.videoSources)) {
    throw new Error("PlatformVideoDetails.video: .videoSources must be an array");
  }
  for (const [i, source] of descriptor.videoSources.entries()) {
    const src = asRecord(source, `video.videoSources[${i}]`);
    expectString(src, "url", `videoSource[${i}]`);
    if (!String(src["plugin_type"] ?? "").includes("Source")) {
      throw new Error(`videoSource[${i}]: missing plugin_type, got ${describe(source)}`);
    }
  }
  if (!Array.isArray(details.subtitles)) throw new Error("PlatformVideoDetails: .subtitles must be an array");
  return details as unknown as { video: UnknownRecord & { videoSources: UnknownRecord[] }; subtitles: UnknownRecord[]; description: string };
}

/** Assert a channel. */
export function expectChannel(value: unknown): UnknownRecord {
  const channel = asRecord(value, "channel");
  if (String(channel["plugin_type"]) !== "PlatformChannel") {
    throw new Error(`expected PlatformChannel, got ${describe(value)}`);
  }
  expectString(channel, "name", "PlatformChannel");
  expectString(channel, "url", "PlatformChannel");
  return channel;
}

/** Assert a comment. */
export function expectComment(value: unknown): UnknownRecord {
  const comment = asRecord(value, "comment");
  if (String(comment["plugin_type"]) !== "Comment") {
    throw new Error(`expected Comment, got ${describe(value)}`);
  }
  expectString(comment, "message", "Comment");
  return comment;
}

/**
 * Extract the plugin_type of an exception thrown by plugin code — matches how
 * the app maps thrown objects to user-facing behavior (ScriptLoginRequiredException
 * prompts login, CaptchaRequiredException opens the captcha browser, …).
 */
export function pluginExceptionType(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const pluginType = (err as UnknownRecord)["plugin_type"];
  return typeof pluginType === "string" ? pluginType : null;
}
