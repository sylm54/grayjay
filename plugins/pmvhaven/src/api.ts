/**
 * Typed pmvhaven.com API client.
 *
 * Endpoints (verified against the live site):
 *   GET /api/videos/search?q=&page=&limit=&sort=uploadDate   — search + browse
 *   GET /api/videos/trending?index=1&period=24h|1h|all       — trending (single page)
 *   GET /api/videos/{id}/comments?index=&page=               — comments
 *   GET /api/tags/autocomplete?q=                            — tag suggestions
 *   GET /video/<slug>_<id>, /users/<name>, /playlists/<id>   — NUXT pages
 */

import type {
  ApiChannelUser,
  ApiComment,
  ApiPagination,
  ApiPlaylist,
  ApiVideo,
  CommentsResponse,
  SearchResponse,
  TagAutocompleteResponse,
  TrendingResponse,
} from "./models.js";
import type { NuxtPayload, Plain } from "./nuxt.js";
import { asArray, asNumber, asRecord, asString, extractNuxtPayload, findNuxtObject } from "./nuxt.js";

const BASE = "https://pmvhaven.com";
const DEFAULT_HEADERS = {
  accept: "application/json, text/plain, */*",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

function get(url: string): string {
  const resp = http.GET(url, DEFAULT_HEADERS, false);
  if (!resp.isOk) {
    if (resp.code === 404) throw new UnavailableException(`Not found: ${url}`);
    throw new ScriptException(`Request failed (${resp.code}) for ${url}`);
  }
  return resp.body;
}

function getJson<T>(url: string): T {
  return JSON.parse(get(url)) as T;
}

/* ============================================================================
 * URLs and ids
 * ========================================================================== */

/** The slug part of a video url is decorative; the trailing id is canonical. */
export function videoUrl(id: string, title: string): string {
  const slug = title.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "video";
  return `${BASE}/video/${slug}_${id}`;
}

export function videoIdFromUrl(url: string): string | undefined {
  const match = url.match(/\/video\/[a-z0-9-]*_?([0-9a-f]{24})(?:[?#].*)?$/i);
  return match?.[1];
}

export function isVideoUrl(url: string): boolean {
  return /^https?:\/\/(?:www\.|m\.)?pmvhaven\.com\/video\/[a-z0-9-]*_[0-9a-f]{24}(?:[?#].*)?$/i.test(url);
}

export function isChannelUrlShape(url: string): boolean {
  return /^https?:\/\/(?:www\.|m\.)?pmvhaven\.com\/users\/[A-Za-z0-9_.-]+(?:[?#].*)?$/i.test(url);
}

export function isPlaylistUrlShape(url: string): boolean {
  return /^https?:\/\/(?:www\.|m\.)?pmvhaven\.com\/playlists\/[0-9a-f]{24}(?:[?#].*)?$/i.test(url);
}

/* ============================================================================
 * JSON APIs
 * ========================================================================== */

export function searchVideos(query: string, page: number, sort?: "uploadDate"): { videos: ApiVideo[]; pagination: ApiPagination } {
  const params = [`q=${encodeURIComponent(query)}`, `page=${page}`, "limit=32"];
  if (sort) params.push(`sort=${sort}`);
  const resp = getJson<SearchResponse>(`${BASE}/api/videos/search?${params.join("&")}`);
  return { videos: resp.videos ?? [], pagination: resp.pagination ?? {} };
}

export function getTrending(period: "1h" | "24h" | "all"): ApiVideo[] {
  const resp = getJson<TrendingResponse>(`${BASE}/api/videos/trending?index=1&period=${period}`);
  return resp.videos ?? [];
}

export function getComments(videoId: string, page: number): { comments: ApiComment[]; pagination: ApiPagination } {
  // The API reports `page` but accepts both `index` and `page`; send both.
  const resp = getJson<CommentsResponse>(`${BASE}/api/videos/${videoId}/comments?index=${page}&page=${page}`);
  return { comments: resp.data ?? [], pagination: resp.pagination ?? {} };
}

export function getTagSuggestions(query: string): string[] {
  if (!query.trim()) return [];
  const resp = getJson<TagAutocompleteResponse>(`${BASE}/api/tags/autocomplete?q=${encodeURIComponent(query)}`);
  return (resp.data ?? [])
    .filter((tag) => tag.name)
    .slice(0, 10)
    .map((tag) => tag.name);
}

/* ============================================================================
 * NUXT pages
 * ========================================================================== */

export interface VideoPage {
  video: ApiVideo;
  recommended: ApiVideo[];
  playlists: ApiPlaylist[];
  comments: ApiComment[];
  uploaderVideos: ApiVideo[];
  uploaderVideosCount?: number;
}

/** Fetch and decode a video page. The url only needs the correct trailing id. */
export function fetchVideoPage(url: string): VideoPage {
  const id = videoIdFromUrl(url);
  if (!id) throw new ScriptException(`Not a pmvhaven video url: ${url}`);
  const payload = extractNuxtPayload(get(url));
  const container = findNuxtObject(payload, ["video", "recommendedVideos", "comments", "uploaderVideos"]);
  if (!container) throw new ScriptException(`Video data not found on page: ${url}`);

  const video = coerceApiVideo(container["video"]);
  if (!video?._id) throw new UnavailableException(`Video unavailable: ${url}`);

  return {
    video,
    recommended: coerceApiVideoArray(container["recommendedVideos"]),
    playlists: coerceApiPlaylistArray(container["playlists"]),
    comments: coerceApiCommentArray(container["comments"]),
    uploaderVideos: coerceApiVideoArray(container["uploaderVideos"]),
    uploaderVideosCount: asNumber(container["uploaderVideosCount"]),
  };
}

export function fetchChannel(url: string): ApiChannelUser {
  const payload = extractNuxtPayload(get(url));
  const container = findNuxtObject(payload, ["username", "videos", "playlists", "subscribersCount"]);
  if (!container) throw new UnavailableException(`Channel not found: ${url}`);

  const username = asString(container["username"]);
  if (!username) throw new ScriptException(`Channel data incomplete on page: ${url}`);

  const social = asRecord(container["socialLinks"]) ?? {};
  const socialLinks: Record<string, string> = {};
  for (const [key, value] of Object.entries(social)) {
    const link = asString(value);
    if (link) socialLinks[key] = link;
  }

  return {
    userId: asString(container["userId"]),
    username,
    avatarUrl: asString(container["avatarUrl"]),
    bannerUrl: asString(container["bannerUrl"]),
    bio: asString(container["bio"]),
    subscribersCount: asNumber(container["subscribersCount"]),
    isVerifiedCreator: container["isVerifiedCreator"] === true,
    createdAt: asString(container["createdAt"]),
    videos: coerceApiVideoArray(container["videos"]),
    playlists: coerceApiPlaylistArray(container["playlists"]),
    socialLinks,
  };
}

export function fetchPlaylist(url: string): ApiPlaylist {
  const payload = extractNuxtPayload(get(url));
  const container = findNuxtObject(payload, ["name", "videos", "videoDetails", "owner"]);
  if (!container) throw new UnavailableException(`Playlist not found: ${url}`);

  const name = asString(container["name"]);
  const id = asString(container["_id"]);
  if (!name || !id) throw new ScriptException(`Playlist data incomplete on page: ${url}`);

  return {
    _id: id,
    name,
    description: asString(container["description"]) ?? "",
    owner: asString(container["owner"]),
    ownerId: asString(container["ownerId"]),
    ownerUsername: asString(container["ownerUsername"]),
    ownerAvatarUrl: asString(container["ownerAvatarUrl"]),
    thumbnailUrl: asString(container["thumbnailUrl"]) ?? asString(container["thumbnail"]),
    videoCount: asNumber(container["videoCount"]),
    views: asNumber(container["views"]),
    createdAt: asString(container["createdAt"]),
    videoDetails: coerceApiVideoArray(container["videoDetails"]),
  };
}

/* ============================================================================
 * Coercion helpers (Plain -> Api models)
 * ========================================================================== */

function coerceApiVideo(value: Plain): ApiVideo | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const id = asString(record["_id"]);
  if (!id) return undefined;
  return {
    _id: id,
    title: asString(record["title"]) ?? "",
    description: asString(record["description"]),
    duration: asString(record["duration"]),
    durationSeconds: asNumber(record["durationSeconds"]),
    views: asNumber(record["views"]),
    likes: asNumber(record["likes"]),
    dislikes: asNumber(record["dislikes"]),
    uploadDate: asString(record["uploadDate"]),
    uploader: asString(record["uploader"]),
    uploaderId: asString(record["uploaderId"]),
    uploaderUsername: asString(record["uploaderUsername"]),
    uploaderAvatarUrl: asString(record["uploaderAvatarUrl"]),
    thumbnailUrl: asString(record["thumbnailUrl"]),
    previewUrl: asString(record["previewUrl"]),
    width: asNumber(record["width"]),
    height: asNumber(record["height"]),
    tags: asArray(record["tags"]).map(asString).filter((t): t is string => t !== undefined),
    top5Tags: asArray(record["top5Tags"]).map(asString).filter((t): t is string => t !== undefined),
    music: asArray(record["music"]).map((entry) => {
      const music = asRecord(entry) ?? {};
      return { artist: asString(music["artist"]), song: asString(music["song"]) };
    }),
    hlsEnabled: record["hlsEnabled"] === true,
    hlsStatus: asString(record["hlsStatus"]),
    hlsMasterPlaylistUrl: asString(record["hlsMasterPlaylistUrl"]),
    hlsVariants: asArray(record["hlsVariants"]).map((entry) => {
      const variant = asRecord(entry) ?? {};
      return {
        resolution: asString(variant["resolution"]),
        width: asNumber(variant["width"]),
        height: asNumber(variant["height"]),
        bandwidth: asNumber(variant["bandwidth"]),
        playlistUrl: asString(variant["playlistUrl"]),
      };
    }),
    videoUrl: asString(record["videoUrl"]),
    isReleased: record["isReleased"] === true,
    moderationStatus: asString(record["moderationStatus"]),
  };
}

function coerceApiVideoArray(value: Plain): ApiVideo[] {
  return asArray(value)
    .map(coerceApiVideo)
    .filter((v): v is ApiVideo => v !== undefined);
}

function coerceApiComment(value: Plain): ApiComment | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const id = asString(record["_id"]);
  if (!id) return undefined;
  return {
    _id: id,
    username: asString(record["username"]),
    userId: asString(record["userId"]),
    avatarUrl: asString(record["avatarUrl"] ?? null) ?? null,
    text: asString(record["text"]) ?? "",
    createdAt: asString(record["createdAt"]),
    likes: asNumber(record["likes"]) ?? 0,
    dislikes: asNumber(record["dislikes"]) ?? 0,
    replies: coerceApiCommentArray(record["replies"]),
    shadowBanned: record["shadowBanned"] === true,
  };
}

function coerceApiCommentArray(value: Plain): ApiComment[] {
  return asArray(value)
    .map(coerceApiComment)
    .filter((c): c is ApiComment => c !== undefined);
}

function coerceApiPlaylistArray(value: Plain): ApiPlaylist[] {
  return asArray(value)
    .map((entry) => {
      const record = asRecord(entry);
      if (!record) return undefined;
      const id = asString(record["_id"]);
      const name = asString(record["name"]);
      if (!id || !name) return undefined;
      const playlist: ApiPlaylist = {
        _id: id,
        name,
        description: asString(record["description"]) ?? "",
        owner: asString(record["owner"]),
        ownerId: asString(record["ownerId"]),
        ownerUsername: asString(record["ownerUsername"]),
        ownerAvatarUrl: asString(record["ownerAvatarUrl"]),
        thumbnailUrl: asString(record["thumbnailUrl"]),
        videoCount: asNumber(record["videoCount"]),
        views: asNumber(record["views"]),
        createdAt: asString(record["createdAt"]),
      };
      return playlist;
    })
    .filter((p): p is ApiPlaylist => p !== undefined);
}

