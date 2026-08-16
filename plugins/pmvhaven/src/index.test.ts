import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Type } from "@grayjay/runtime";
import {
  expectChannel,
  expectComment,
  expectContent,
  expectPager,
  expectVideo,
  expectVideoDetails,
  loadPlugin,
  pluginExceptionType,
  type PluginEnv,
} from "@grayjay/tester";

/**
 * All tests run against captured real responses (test-fixtures/) — no network.
 * Fixtures are preloaded into a synchronous cache because mock handlers must
 * answer synchronously, like the engine.
 */
const FIXTURES = join(import.meta.dir, "..", "test-fixtures");

const VIDEO_URL = "https://pmvhaven.com/video/bbc-craving_6a819aaae4c7e4c46df5d55c";
const CHANNEL_URL = "https://pmvhaven.com/users/bolos777";
const PLAYLIST_URL = "https://pmvhaven.com/playlists/692b70ccd7984d93b13f477a";

async function fixtureText(name: string): Promise<string> {
  return await Bun.file(join(FIXTURES, name)).text();
}

// Synchronous fixture cache keyed by the exact URLs the plugin requests.
const cache = new Map<string, string>();
function readSync(url: string): string {
  const cached = cache.get(url);
  if (cached === undefined) throw new Error(`fixture not preloaded for request: ${url}`);
  return cached;
}

/** Preload every fixture under the URLs the plugin will request. */
async function preload(): Promise<void> {
  cache.clear();
  cache.set("https://pmvhaven.com/api/videos/search?q=pmv&page=1&limit=32&sort=uploadDate", await fixtureText("search.json"));
  cache.set("https://pmvhaven.com/api/videos/search?q=pmv&page=2&limit=32&sort=uploadDate", await fixtureText("search-page2.json"));
  cache.set("https://pmvhaven.com/api/videos/search?q=test&page=1&limit=32", await fixtureText("search.json"));
  cache.set("https://pmvhaven.com/api/videos/search?q=test&page=1&limit=32&sort=uploadDate", await fixtureText("search.json"));
  cache.set("https://pmvhaven.com/api/videos/search?q=test&page=2&limit=32", await fixtureText("search-page2.json"));
  cache.set("https://pmvhaven.com/api/videos/trending?index=1&period=all", await fixtureText("trending-all.json"));
  cache.set("https://pmvhaven.com/api/videos/trending?index=1&period=24h", await fixtureText("trending.json"));
  cache.set("https://pmvhaven.com/api/videos/6a819aaae4c7e4c46df5d55c/comments?index=1&page=1", await fixtureText("comments.json"));
  cache.set("https://pmvhaven.com/api/tags/autocomplete?q=bbc", await fixtureText("tag-autocomplete.json"));
  cache.set(VIDEO_URL, await fixtureText("video-page.html"));
  cache.set(CHANNEL_URL, await fixtureText("channel-page.html"));
  cache.set(PLAYLIST_URL, await fixtureText("playlist-page.html"));
}

async function makeEnv(settings: Record<string, string> = {}): Promise<PluginEnv> {
  return await loadPlugin({
    config: join(import.meta.dir, "..", "grayjay.config.ts"),
    script: join(import.meta.dir, "..", "dist", "PMVHavenScript.js"),
    settings,
    http: {
      mock: (req) => ({ code: 200, body: readSync(req.url), headers: {} }),
    },
  });
}

describe("PMVHaven", () => {
  test("home (latest uploads) paginates through the search API", async () => {
    await preload();
    const env = await makeEnv();
    const pager = expectPager(env.source.getHome(), "VideoPager");
    expect(pager.results.length).toBeGreaterThan(0);
    expectVideo(pager.results[0]!);
    expect(pager.hasMore).toBe(true);

    const before = env.requests.length;
    pager.nextPage!();
    expect(env.requests.length).toBe(before + 1);
    expect(pager.results.length).toBeGreaterThan(0);
  });

  test("home (trending all time) is a single page", async () => {
    await preload();
    const env = await makeEnv({ "Home feed": "1" }); // dropdown index 1 = Trending (all time)
    const pager = expectPager(env.source.getHome(), "VideoPager");
    expect(pager.results.length).toBeGreaterThan(0);
    expectVideo(pager.results[0]!);
    expect(pager.hasMore).toBe(false);
    expect(env.requests.some((r) => r.url.includes("period=all"))).toBe(true);
  });

  test("search returns engine-contract videos and paginates", async () => {
    await preload();
    const env = await makeEnv();
    const pager = expectPager(env.source.search!("test", null, null, null), "VideoPager");
    expectVideo(pager.results[0]!);
    pager.nextPage!();
    expect(env.requests.some((r) => r.url.includes("page=2"))).toBe(true);
  });

  test("chronological order maps to the uploadDate sort", async () => {
    await preload();
    const env = await makeEnv();
    env.source.search!("test", null, Type.Order.Chronological, null);
    expect(env.requests.some((r) => r.url.includes("sort=uploadDate"))).toBe(true);
  });

  test("search suggestions come from tag autocomplete", async () => {
    await preload();
    const env = await makeEnv();
    const suggestions = env.source.searchSuggestions!("bbc");
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions).toContain("bbc");
  });

  test("url detection: videos, channels, playlists — and nothing else", async () => {
    await preload();
    const env = await makeEnv();
    expect(env.source.isContentDetailsUrl!(VIDEO_URL)).toBe(true);
    expect(env.source.isContentDetailsUrl!("https://pmvhaven.com/video/wrong-slug-entirely_6a819aaae4c7e4c46df5d55c")).toBe(true);
    expect(env.source.isContentDetailsUrl!("https://pmvhaven.com/video/not-an-id")).toBe(false);
    expect(env.source.isContentDetailsUrl!("https://evil.test/video/bbc-craving_6a819aaae4c7e4c46df5d55c")).toBe(false);
    expect(env.source.isChannelUrl!(CHANNEL_URL)).toBe(true);
    expect(env.source.isChannelUrl!("https://pmvhaven.com/users/68fd011cb99aaf24a4c097e4")).toBe(true);
    expect(env.source.isChannelUrl!(VIDEO_URL)).toBe(false);
    expect(env.source.isPlaylistUrl!(PLAYLIST_URL)).toBe(true);
    expect(env.source.isPlaylistUrl!("https://pmvhaven.com/playlists/nope")).toBe(false);
  });

  test("content details: sources, rating, author, duration, rich description", async () => {
    await preload();
    const env = await makeEnv();
    const details = expectVideoDetails(env.source.getContentDetails!(VIDEO_URL));
    const detail = details as unknown as Record<string, unknown>;

    expect(details.video.videoSources.length).toBe(1); // progressive mp4
    const live = detail.live as { plugin_type: string; url: string };
    expect(live.plugin_type).toBe("HLSSource");
    expect(live.url).toContain("master.m3u8");

    expect(detail.rating).toEqual({ type: 2, likes: 22, dislikes: 1 });
    expect(detail.duration).toBe(169); // durationSeconds, not "2:49"
    expect(detail.viewCount).toBeGreaterThan(0);
    expect(detail.datetime).toBeGreaterThan(0);
    expect((detail.author as { name: string }).name).toBe("bolos777");

    // Rich description: stats + hashtags
    expect(details.description).toContain("#");
    expect(details.description.length).toBeGreaterThan(10);
  });

  test("details + recommendations share one page fetch (cache)", async () => {
    await preload();
    const env = await makeEnv();
    env.source.getContentDetails!(VIDEO_URL);
    env.source.getContentRecommendations!(VIDEO_URL);
    const videoFetches = env.requests.filter((r) => /\/video\//.test(r.url)).length;
    expect(videoFetches).toBe(1);

    const pager = expectPager(env.source.getContentRecommendations!(VIDEO_URL), "VideoPager");
    expect(pager.results.length).toBeGreaterThan(0);
    expectVideo(pager.results[0]!);
  });

  test("the details object exposes getContentRecommendations (zero-arg, like the engines invoke it)", async () => {
    await preload();
    const env = await makeEnv();
    const details = env.source.getContentDetails!(VIDEO_URL) as unknown as {
      getContentRecommendations?: () => unknown;
    };
    expect(typeof details.getContentRecommendations).toBe("function");

    // Android + desktop both call it with no arguments.
    const pager = expectPager(details.getContentRecommendations!(), "VideoPager");
    expect(pager.results.length).toBeGreaterThan(0);
    expectVideo(pager.results[0]!);

    // Still a single page fetch: details, source-level and details-object use
    // one shared cache.
    const videoFetches = env.requests.filter((r) => /\/video\//.test(r.url)).length;
    expect(videoFetches).toBe(1);
  });

  test("recommendations fall back to uploader videos when a page has none", async () => {
    await preload();
    // "--nocache--" forces a fresh page fetch; first serve a page WITHOUT
    // recommendedVideos, then the fallback (uploader videos) must kick in.
    const noRecFixture = (await fixtureText("video-page.html")).replace('"recommendedVideos"', '"recommendedVideosXXX"');
    cache.set("https://pmvhaven.com/video/norecs_000000000000000000000000", noRecFixture);
    const env = await makeEnv();
    const pager = expectPager(
      env.source.getContentRecommendations!("https://pmvhaven.com/video/norecs_000000000000000000000000"),
      "VideoPager",
    );
    // The uploader's videos from the same page payload.
    expect(pager.results.length).toBeGreaterThan(0);
  });

  test("comments map to the engine contract", async () => {
    await preload();
    const env = await makeEnv();
    const pager = expectPager(env.source.getComments!(VIDEO_URL), "CommentPager");
    expect(pager.results.length).toBeGreaterThan(0);
    const comment = expectComment(pager.results[0]!);
    expect((comment as unknown as { message: string }).message.length).toBeGreaterThan(0);

    const sub = expectPager(env.source.getSubComments!(pager.results[0] as never), "CommentPager");
    expect(sub.results).toEqual([]);
  });

  test("channels: info, videos, playlists", async () => {
    await preload();
    const env = await makeEnv();
    const channel = expectChannel(env.source.getChannel!(CHANNEL_URL));
    const chan = channel as unknown as Record<string, unknown>;
    expect(chan.subscribers).toBeGreaterThan(0);
    expect(chan.name).toBe("bolos777");

    const contents = expectPager(env.source.getChannelContents!(CHANNEL_URL, null, null, null), "VideoPager");
    expect(contents.results.length).toBeGreaterThan(0);
    expectVideo(contents.results[0]!);
    expect(contents.hasMore).toBe(false);

    const playlists = expectPager(env.source.getChannelPlaylists!(CHANNEL_URL), "PlaylistPager");
    expect(playlists.results.length).toBeGreaterThan(0);
    expectContent(playlists.results[0]!);
  });

  test("playlists expose their contents", async () => {
    await preload();
    const env = await makeEnv();
    const playlist = env.source.getPlaylist!(PLAYLIST_URL) as unknown as {
      plugin_type: string;
      name: string;
      videoCount: number;
      contents: { results: unknown[]; hasMore: boolean };
    };
    expect(playlist.plugin_type).toBe("PlatformPlaylistDetails");
    expect(playlist.name).toBe("best");
    expect(playlist.videoCount).toBeGreaterThan(0);
    const contents = expectPager(playlist.contents, "VideoPager");
    expect(contents.results.length).toBeGreaterThan(0);
    expectVideo(contents.results[0]!);
  });

  test("typed exceptions on unavailable pages", async () => {
    await preload();
    const env = await loadPlugin({
      config: join(import.meta.dir, "..", "grayjay.config.ts"),
      script: join(import.meta.dir, "..", "dist", "PMVHavenScript.js"),
      http: { mock: () => ({ code: 404, body: "" }) },
    });
    try {
      env.source.getChannel!(CHANNEL_URL);
      expect.unreachable();
    } catch (err) {
      expect(pluginExceptionType(err)).toBe("UnavailableException");
    }
  });

  test("enable logs and saveState roundtrip", async () => {
    await preload();
    const env = await makeEnv();
    expect(env.logs.some((line) => line.includes("PMVHaven enabled (v14)"))).toBe(true);
    const state = env.source.saveState!();
    expect(JSON.parse(state).savedAt).toBeGreaterThan(0);
  });
});
