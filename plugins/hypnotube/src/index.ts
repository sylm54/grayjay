/**
 * Hypnotube — Grayjay plugin (typed rebuild).
 *
 * Supports: home feeds (latest / top rated / most discussed / most viewed,
 * over a selectable timeframe), search with sorts, video details with
 * related videos, comments, channel pages and playlists.
 */

import {
  feedUrl,
  fetchComments,
  fetchPlaylist,
  fetchUser,
  fetchVideoPage,
  isPlaylistUrl,
  isUserUrl,
  isVideoUrl,
  searchUrl,
  userUploadsUrl,
  type FeedPeriod,
  type FeedSort,
  type SearchSort,
} from "./api.js";
import { toChannel, toComment, toFeedVideo, toPlaylistDetails, toVideoDetails } from "./mapping.js";
import { GridPager, SearchPager } from "./pagers.js";

const HOME_FEEDS: FeedSort[] = ["most-recent", "top-rated", "most-discussed", "most-viewed"];
const HOME_PERIODS: FeedPeriod[] = ["", "day", "week", "month"];

/**
 * Dropdown settings arrive as 0-based indices (the engines JSON.parse setting
 * values, so indices are the portable representation).
 */
function settingIndex(name: string, fallback = 0): number {
  const value = (plugin.settings as Record<string, unknown>)[name];
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function sortFromOrder(order: string | null): SearchSort {
  if (order === null) return "";
  const normalized = order.toLowerCase();
  if (normalized.includes("chronological") || normalized.includes("date")) return "newest";
  if (normalized.includes("rating")) return "rating";
  if (normalized.includes("views")) return "views";
  return "";
}

definePlugin({
  enable(config, settings, savedState) {
    log(`Hypnotube enabled (v${config.version}) home=${(settings as Record<string, unknown>)["Home feed"] ?? "default"}`);
    if (savedState) log("state restored");
  },

  saveState() {
    return JSON.stringify({ savedAt: Date.now() });
  },

  /* -- feeds ------------------------------------------------------------------ */

  getHome() {
    const sort = HOME_FEEDS[settingIndex("Home feed", 0)] ?? "most-recent";
    const period = sort === "most-recent" ? "" : (HOME_PERIODS[settingIndex("Home feed timeframe", 0)] ?? "");
    return new GridPager(feedUrl(sort, period));
  },

  /* -- search ------------------------------------------------------------------- */

  searchSuggestions(_query) {
    // The site's suggestion API (/api/v1/search.php) rejects non-browser
    // requests; no usable public suggestion endpoint exists.
    return [];
  },

  getSearchCapabilities() {
    return {
      types: [Type.Feed.Mixed],
      sorts: [Type.Order.Chronological, "^rating", "^views"],
      filters: [],
    };
  },

  search(query, _type, order, _filters) {
    return new SearchPager(query, searchUrl(query, sortFromOrder(order)));
  },

  searchChannelContents(channelUrl, query, type, order, filters) {
    // No uploader-scoped search exists; combine the username with the query.
    const username = decodeURIComponent(channelUrl.split("/").pop() ?? "").replace(/-\d+\/?$/, "");
    const combined = query ? `${query} ${username}` : username;
    void type;
    void filters;
    return new SearchPager(combined, searchUrl(combined, sortFromOrder(order)));
  },

  /* -- channels -------------------------------------------------------------------- */

  isChannelUrl(url) {
    return isUserUrl(url);
  },

  getChannel(url) {
    return toChannel(fetchUser(url));
  },

  getChannelContents(url) {
    return new GridPager(userUploadsUrl(url));
  },

  /* -- content ------------------------------------------------------------------------ */

  isContentDetailsUrl(url) {
    return isVideoUrl(url);
  },

  getContentDetails(url) {
    return toVideoDetails(fetchVideoPage(url));
  },

  getContentRecommendations(url) {
    // Source-level path (client.getContentRecommendations); the details object
    // provides the details-object path with an uploader fallback.
    const page = fetchVideoPage(url);
    return new VideoPager(page.related.map(toFeedVideo), false, { url });
  },

  /* -- comments --------------------------------------------------------------------------- */

  getComments(url) {
    const comments = fetchComments(url);
    return new CommentPager(comments.map((comment) => toComment(comment, url)), false, { url });
  },

  getSubComments(_comment) {
    // Comments are flat on hypnotube.
    return new CommentPager([], false, {});
  },

  /* -- playlists ----------------------------------------------------------------------------- */

  isPlaylistUrl(url) {
    return isPlaylistUrl(url);
  },

  getPlaylist(url) {
    const { playlist, videos } = fetchPlaylist(url);
    return toPlaylistDetails(playlist, videos);
  },
});
