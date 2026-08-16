/**
 * PMVHaven — Grayjay plugin (typed rebuild).
 *
 * Supports: home/trending feeds, search with tag suggestions and sort,
 * video details (HLS + progressive), related videos, comments with replies,
 * channel pages with videos and playlists, and playlist pages.
 */

import {
  fetchChannel,
  fetchPlaylist,
  fetchVideoPage,
  getComments,
  getTagSuggestions,
  isChannelUrlShape,
  isPlaylistUrlShape,
  isVideoUrl,
  searchVideos,
  videoIdFromUrl,
} from "./api.js";
import { toChannel, toComment, toFeedVideo, toPlaylistDetails, toPlaylistEntry, toVideoDetails } from "./mapping.js";
import { PmvCommentsPager, SearchPager, TrendingPager } from "./pagers.js";
import type { ApiComment } from "./models.js";

/** Small cache of decoded video pages (details + recommendations share one fetch). */
const videoPageCache = new Map<string, ReturnType<typeof fetchVideoPage>>();
const CACHE_LIMIT = 5;

function cachedVideoPage(url: string): ReturnType<typeof fetchVideoPage> {
  const id = videoIdFromUrl(url) ?? url;
  const cached = videoPageCache.get(id);
  if (cached) return cached;
  const page = fetchVideoPage(url);
  if (videoPageCache.size >= CACHE_LIMIT) {
    const oldest = videoPageCache.keys().next().value;
    if (oldest !== undefined) videoPageCache.delete(oldest);
  }
  videoPageCache.set(id, page);
  return page;
}

type HomeFeed = "latest" | "trending-all" | "trending-24h" | "trending-1h";

const HOME_FEEDS: HomeFeed[] = ["latest", "trending-all", "trending-24h", "trending-1h"];

/**
 * Dropdown settings arrive as 0-based indices (the engines JSON.parse setting
 * values, so indices are the portable representation).
 */
function settingIndex(name: string, fallback = 0): number {
  const value = (plugin.settings as Record<string, unknown>)[name];
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function homeFeedSetting(): HomeFeed {
  return HOME_FEEDS[settingIndex("Home feed", 0)] ?? "latest";
}

/** The site's core content is discoverable via "pmv" sorted by upload date. */
const LATEST_QUERY = "pmv";

function sortFromOrder(order: string | null): "uploadDate" | undefined {
  if (order === null) return undefined;
  const normalized = order.toLowerCase();
  if (normalized.includes("chronological") || normalized.includes("release_time") || normalized.includes("date")) {
    return "uploadDate";
  }
  return undefined;
}

definePlugin({
  enable(config, settings, savedState) {
    log(`PMVHaven enabled (v${config.version}) home=${(settings as Record<string, unknown>)["Home feed"] ?? "default"}`);
    if (savedState) log("state restored");
  },

  saveState() {
    return JSON.stringify({ savedAt: Date.now() });
  },

  /* -- feeds ------------------------------------------------------------------ */

  getHome() {
    switch (homeFeedSetting()) {
      case "trending-all":
        return new TrendingPager("all");
      case "trending-24h":
        return new TrendingPager("24h");
      case "trending-1h":
        return new TrendingPager("1h");
      default:
        return new SearchPager(LATEST_QUERY, "uploadDate", searchVideos(LATEST_QUERY, 1, "uploadDate"), 1);
    }
  },

  /* -- search ------------------------------------------------------------------- */

  searchSuggestions(query) {
    try {
      return getTagSuggestions(query);
    } catch (err) {
      log(`suggestions failed: ${(err as Error).message}`);
      return [];
    }
  },

  getSearchCapabilities() {
    return {
      types: [Type.Feed.Mixed],
      sorts: [Type.Order.Chronological, "^release_time"],
      filters: [],
    };
  },

  search(query, type, order, filters) {
    void type;
    void filters;
    const sort = sortFromOrder(order);
    return new SearchPager(query, sort, searchVideos(query, 1, sort), 1);
  },

  searchChannelContents(channelUrl, query, type, order, filters) {
    // No dedicated uploader filter exists in the public search API; searching
    // the uploader name (optionally combined with a query) is the best match.
    const username = decodeURIComponent(channelUrl.split("/").pop() ?? "");
    const combined = query ? `${query} ${username}` : username;
    const sort = sortFromOrder(order);
    void type;
    void filters;
    return new SearchPager(combined, sort, searchVideos(combined, 1, sort), 1);
  },

  /* -- channels -------------------------------------------------------------------- */

  isChannelUrl(url) {
    return isChannelUrlShape(url);
  },

  getChannel(url) {
    return toChannel(fetchChannel(url));
  },

  getChannelContents(url) {
    // The channel page embeds the uploader's latest videos; the site paginates
    // these client-side, so we serve the embedded page as a single result page.
    const channel = fetchChannel(url);
    return new VideoPager((channel.videos ?? []).map(toFeedVideo), false, { url });
  },

  getChannelPlaylists(url) {
    const channel = fetchChannel(url);
    return new PlaylistPager((channel.playlists ?? []).map(toPlaylistEntry), false, { url });
  },

  /* -- content ------------------------------------------------------------------------ */

  isContentDetailsUrl(url) {
    return isVideoUrl(url);
  },

  getContentDetails(url) {
    return toVideoDetails(cachedVideoPage(url).video);
  },

  getContentRecommendations(url) {
    const recommended = cachedVideoPage(url).recommended ?? [];
    return new VideoPager(recommended.map(toFeedVideo), false, { url });
  },

  /* -- comments --------------------------------------------------------------------------- */

  getComments(url) {
    const id = videoIdFromUrl(url);
    if (!id) throw new ScriptException(`Not a pmvhaven video url: ${url}`);
    const { comments, pagination } = getComments(id, 1);
    return new PmvCommentsPager(id, url, comments, pagination, 1);
  },

  getSubComments(comment) {
    const parsed = typeof comment === "string" ? JSON.parse(comment) : comment;
    const replies = ((parsed as { context?: { replies?: ApiComment[] } })?.context?.replies ?? []) as ApiComment[];
    const contextUrl = (parsed as { contextUrl?: string })?.contextUrl ?? "";
    return new CommentPager(replies.map((reply) => toComment(reply, contextUrl)), false, {});
  },

  /* -- playlists ----------------------------------------------------------------------------- */

  isPlaylistUrl(url) {
    return isPlaylistUrlShape(url);
  },

  getPlaylist(url) {
    return toPlaylistDetails(fetchPlaylist(url));
  },
});
