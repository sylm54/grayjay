import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const CONFIG = join(ROOT, "grayjay.config.ts");
const SCRIPT = join(ROOT, "dist", "FeedDemoScript.js");
import {
  collectPages,
  expectChannel,
  expectComment,
  expectPager,
  expectVideo,
  expectVideoDetails,
  loadPlugin,
  pluginExceptionType,
} from "@grayjay/tester";

/**
 * FeedDemo tests run against the *built bundle* (gj test rebuilds first) with
 * a deterministic http mock — no network needed.
 */
describe("FeedDemo", () => {
  const envPromise = loadPlugin({
    config: CONFIG,
    script: SCRIPT,
    settings: { "Feed size": "10", "Include live": true },
    http: {
      mock: (req) => {
        if (req.url.startsWith("https://api.feeddemo.test/")) {
          return { code: 200, body: JSON.stringify({ ok: true }), headers: {} };
        }
        return { code: 404, body: "" };
      },
    },
  });

  test("enable ran with parsed settings", async () => {
    const env = await envPromise;
    expect(env.logs.some((line) => line.includes("FeedDemo enabled (v1)"))).toBe(true);
    // The demo API hello request fires from getHome:
    env.source.getHome();
    expect(env.requests.some((r) => r.url === "https://api.feeddemo.test/v1/hello")).toBe(true);
  });

  test("home feed: contract + three pages", async () => {
    const env = await envPromise;
    const pager = env.source.getHome();
    const first = expectPager(pager, "VideoPager");
    expect(first.results.length).toBe(10);
    expectVideo(first.results[0]);

    const all = collectPages(pager, { maxPages: 10 });
    expect(all.length).toBe(30); // 3 pages x 10
  });

  test("settings drive feed size", async () => {
    const env = await loadPlugin({
      config: CONFIG,
      script: SCRIPT,
      settings: { "Feed size": "5" },
      http: { mock: () => ({ code: 200, body: "{}" }) },
    });
    const pager = expectPager(env.source.getHome(), "VideoPager");
    expect(pager.results.length).toBe(5);
  });

  test("search with duration filter", async () => {
    const env = await envPromise;
    const result = expectPager(
      env.source.search!("demo query", null, null, { duration: ["short"] }),
      "VideoPager",
    );
    for (const item of result.results) {
      const video = expectVideo(item);
      expect(video.duration).toBeLessThanOrEqual(60);
    }
  });

  test("search suggestions and capabilities", async () => {
    const env = await envPromise;
    expect(env.source.searchSuggestions!("abc")).toEqual(["abc", "abc in 2026", "abc tutorial"]);
    const capabilities = env.source.getSearchCapabilities!();
    expect(capabilities.types).toContain("MIXED");
    expect(capabilities.filters?.[0]?.name).toBe("Duration");
  });

  test("channels", async () => {
    const env = await envPromise;
    expect(env.source.isChannelUrl!("https://feeddemo.test/channel?x=1")).toBe(true);
    expect(env.source.isChannelUrl!("https://other.test/channel")).toBe(false);
    expectChannel(env.source.getChannel!("https://feeddemo.test/channel"));
    const results = expectPager(env.source.searchChannels!("demo"), "ChannelPager");
    expect(results.results.length).toBe(1);
  });

  test("content details: sources, live, subtitles, chapters", async () => {
    const env = await envPromise;
    const url = "https://feeddemo.test/watch/search-demo-1";
    expect(env.source.isContentDetailsUrl!(url)).toBe(true);
    const details = expectVideoDetails(env.source.getContentDetails!(url));
    expect(details.video.videoSources.length).toBe(2);
    expect(details.description).toContain("Deterministic demo content");
    const chapters = env.source.getContentChapters!(url);
    expect(chapters.length).toBe(2);
  });

  test("live items use HLS", async () => {
    const env = await envPromise;
    const details = expectVideoDetails(
      env.source.getContentDetails!("https://feeddemo.test/watch/home-0-1"),
    );
    // FeedDemo marks home-0-1 live; the engine contract wants `live` set.
    expect((details as { isLive?: boolean }).isLive).toBe(true);
  });

  test("typed exceptions map to app behavior", async () => {
    const env = await envPromise;
    try {
      env.source.getContentDetails!("https://feeddemo.test/watch/members-only-1");
      expect.unreachable();
    } catch (err) {
      expect(pluginExceptionType(err)).toBe("ScriptLoginRequiredException");
    }
    try {
      env.source.getContentDetails!("https://feeddemo.test/watch/gone-1");
      expect.unreachable();
    } catch (err) {
      expect(pluginExceptionType(err)).toBe("UnavailableException");
    }
  });

  test("comments + replies", async () => {
    const env = await envPromise;
    const pager = expectPager(env.source.getComments!("https://feeddemo.test/watch/x"), "CommentPager");
    expectComment(pager.results[0]);
    const sub = expectPager(env.source.getSubComments!(pager.results[0] as never), "CommentPager");
    expect(sub.results.length).toBe(1);
  });

  test("playlists", async () => {
    const env = await envPromise;
    const url = "https://feeddemo.test/playlist/demo";
    expect(env.source.isPlaylistUrl!(url)).toBe(true);
    const playlist = env.source.getPlaylist!(url) as { plugin_type: string; contents: unknown; videoCount: number };
    expect(playlist.plugin_type).toBe("PlatformPlaylistDetails");
    expect(playlist.videoCount).toBe(10);
    const contents = expectPager(playlist.contents, "VideoPager");
    expect(contents.results.length).toBe(10);
  });

  test("playback tracker logs progress", async () => {
    const env = await envPromise;
    const tracker = env.source.getPlaybackTracker!("https://feeddemo.test/watch/x");
    tracker!.setProgress(42);
    expect(env.logs.some((line) => line.includes("playback progress") && line.includes("42s"))).toBe(true);
  });

  test("saveState roundtrip", async () => {
    const env = await envPromise;
    const state = env.source.saveState!();
    expect(JSON.parse(state).lastSeen).toBeGreaterThan(0);
    const env2 = await loadPlugin({
      config: CONFIG,
      script: SCRIPT,
      savedState: state,
      http: { mock: () => ({ code: 200, body: "{}" }) },
    });
    expect(env2.logs.some((line) => line.includes("restored state"))).toBe(true);
  });
});
