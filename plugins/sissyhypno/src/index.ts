/**
 * Sissyhypno — Grayjay plugin (typed rebuild of github.com/sylm54/shypno).
 *
 * Supports: home feeds (latest/top-rated/most-discussed/most-viewed over a
 * timeframe), search, video details with tags/categories/rating, related
 * videos, user channels with paginated uploads, and comments.
 */

import {
  BASE,
  fetchChannel,
  fetchComments,
  fetchFeedPage,
  fetchVideoDetails,
  isChannelUrl,
  isVideoUrl,
  searchUrl,
  userIdFromUrl,
  videoIdFromUrl,
} from "./scrape.js";
import { toChannel, toComment, toFeedVideo, toVideoDetails } from "./mapping.js";
import { GridPager } from "./pagers.js";

type HomeFeed = "most-recent" | "top-rated" | "most-discussed" | "most-viewed";
const HOME_FEEDS: HomeFeed[] = ["most-recent", "top-rated", "most-discussed", "most-viewed"];
const HOME_TIMEFRAMES = ["", "day/", "week/", "month/"];

/**
 * Dropdown settings arrive as 0-based indices (the engines JSON.parse setting
 * values, so indices are the portable representation).
 */
function settingIndex(name: string, fallback = 0): number {
  const value = (plugin.settings as Record<string, unknown>)[name];
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function gridPager(baseUrl: string, context: PagerContext): GridPager {
  return new GridPager(baseUrl, fetchFeedPage(baseUrl, 1), 1, context);
}

definePlugin({
  enable(config, settings, savedState) {
    log(`Sissyhypno enabled (v${config.version}) home=${(settings as Record<string, unknown>)["Home feed"] ?? "default"}`);
    if (savedState) log("state restored");
  },

  saveState() {
    return JSON.stringify({ savedAt: Date.now() });
  },

  /* -- feeds ------------------------------------------------------------------ */

  getHome() {
    const category = HOME_FEEDS[settingIndex("Home feed", 0)] ?? "most-recent";
    const timeframe = HOME_TIMEFRAMES[settingIndex("Home feed timeframe", 0)] ?? "";
    return gridPager(`${BASE}/${category}/${timeframe}`, { category, timeframe });
  },

  /* -- search ------------------------------------------------------------------- */

  searchSuggestions(_query) {
    // The site has no suggestion endpoint.
    return [];
  },

  getSearchCapabilities() {
    return {
      types: [Type.Feed.Mixed],
      sorts: [Type.Order.Chronological],
      filters: [],
    };
  },

  search(query, _type, _order, _filters) {
    return gridPager(searchUrl(query), { query });
  },

  getSearchChannelContentsCapabilities() {
    return {
      types: [Type.Feed.Mixed],
      sorts: [Type.Order.Chronological],
      filters: [],
    };
  },

  searchChannelContents(channelUrl, query, _type, _order, _filters) {
    // No uploader-scoped search exists; combine the channel name with the query.
    const username = decodeURIComponent(channelUrl.split("/").filter(Boolean).pop() ?? "").replace(/-\d+\/?$/, "");
    const combined = query ? `${query} ${username}` : username;
    return gridPager(searchUrl(combined), { query: combined });
  },

  searchChannels(_query) {
    return new ChannelPager([], false, {});
  },

  /* -- channels -------------------------------------------------------------------- */

  isChannelUrl(url) {
    return isChannelUrl(url);
  },

  getChannel(url) {
    return toChannel(fetchChannel(url));
  },

  getChannelContents(url) {
    const id = userIdFromUrl(url);
    if (!id) throw new ScriptException(`Not a sissyhypno user url: ${url}`);
    return gridPager(`${BASE}/uploads-by-user/${id}/`, { channel: url });
  },

  /* -- content ------------------------------------------------------------------------ */

  isContentDetailsUrl(url) {
    return isVideoUrl(url);
  },

  getContentDetails(url) {
    return toVideoDetails(fetchVideoDetails(url));
  },

  getContentRecommendations(url) {
    // Source-level path; the details object also provides the details-object path.
    const { related } = fetchVideoDetails(url);
    return new VideoPager(related.map(toFeedVideo), false, { url });
  },

  /* -- comments --------------------------------------------------------------------------- */

  getComments(url) {
    const id = videoIdFromUrl(url);
    if (!id) throw new ScriptException(`Not a sissyhypno video url: ${url}`);
    const comments = fetchComments(id);
    // The ajax endpoint returns all comments in one shot (no pagination).
    return new CommentPager(comments.map((c) => toComment(c, url)), false, { videoId: id });
  },

  getSubComments(_comment) {
    // Comments are flat on this site.
    return new CommentPager([], false, {});
  },
});
