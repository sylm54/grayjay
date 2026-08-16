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
  type PluginEnv,
} from "@grayjay/tester";

/**
 * All tests run against captured real responses (test-fixtures/) — no network.
 * Fixtures are preloaded into a synchronous cache because mock handlers must
 * answer synchronously, like the engine.
 */
const FIXTURES = join(import.meta.dir, "..", "test-fixtures");

const HOME = "https://sissyhypno.com/most-recent/";
const TOP_RATED = "https://sissyhypno.com/top-rated/";
const SEARCH = "https://sissyhypno.com/search/sissy/";
const SEARCH_PAGE2 = "https://sissyhypno.com/search/sissy/page2.html";
const VIDEO_URL = "https://sissyhypno.com/video/sissy-hypno-slut-follow-your-dreams-16461966.html";
const COMMENTS_VIDEO_URL = "https://sissyhypno.com/video/anal-trainer-motivational-sissy-hypno-1077.html";
const COMMENTS_URL = "https://sissyhypno.com/templates/default_tube2016/template.ajax_comments.php?id=1077";
const CHANNEL_URL = "https://sissyhypno.com/user/sissyhypno-2/";
const CHANNEL_UPLOADS = "https://sissyhypno.com/uploads-by-user/2/";
const CHANNEL_UPLOADS_PAGE2 = "https://sissyhypno.com/uploads-by-user/2/page2.html";
const EMPTY_RESULTS = "https://sissyhypno.com/most-viewed/month/";

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
  cache.set(HOME, await fixtureText("sh_home.html"));
  cache.set("https://sissyhypno.com/most-recent/page2.html", await fixtureText("sh_search.html"));
  cache.set(TOP_RATED, await fixtureText("sh_home.html"));
  cache.set("https://sissyhypno.com/top-rated/week/", await fixtureText("sh_home.html"));
  cache.set(SEARCH, await fixtureText("sh_search.html"));
  cache.set(SEARCH_PAGE2, await fixtureText("sh_search.html"));
  cache.set(VIDEO_URL, await fixtureText("sh_video.html"));
  cache.set(COMMENTS_URL, await fixtureText("sh_comments.html"));
  cache.set(CHANNEL_URL, await fixtureText("sh_user.html"));
  // The uploads grid uses the same card markup as search results.
  cache.set(CHANNEL_UPLOADS, await fixtureText("sh_search.html"));
  cache.set(CHANNEL_UPLOADS_PAGE2, await fixtureText("empty-results.html"));
  cache.set(EMPTY_RESULTS, await fixtureText("empty-results.html"));
}

async function makeEnv(settings: Record<string, string> = {}): Promise<PluginEnv> {
  return await loadPlugin({
    config: join(import.meta.dir, "..", "grayjay.config.ts"),
    script: join(import.meta.dir, "..", "dist", "SissyhypnoScript.js"),
    settings,
    http: {
      mock: (req) => ({ code: 200, body: readSync(req.url), headers: {} }),
    },
  });
}

describe("Sissyhypno", () => {
  test("home (latest) paginates the most-recent grid", async () => {
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
    expect(env.requests.some((r) => r.url === SEARCH_PAGE2 || r.url.endsWith("/page2.html"))).toBe(true);
  });

  test("home feed setting selects the category and timeframe", async () => {
    await preload();
    const env = await makeEnv({ "Home feed": "1", "Home feed timeframe": "2" }); // Top Rated / Week
    expectPager(env.source.getHome(), "VideoPager");
    expect(env.requests.some((r) => r.url === "https://sissyhypno.com/top-rated/week/")).toBe(true);
  });

  test("a feed that reports no results terminates immediately", async () => {
    await preload();
    const env = await makeEnv({ "Home feed": "3", "Home feed timeframe": "3" }); // Most Viewed / Month
    const pager = expectPager(env.source.getHome(), "VideoPager");
    expect(pager.results).toHaveLength(0);
    expect(pager.hasMore).toBe(false);
  });

  test("search returns video cards and paginates", async () => {
    await preload();
    const env = await makeEnv();
    const pager = expectPager(env.source.search!("sissy", Type.Feed.Mixed, null, {}), "VideoPager");
    expect(pager.results.length).toBeGreaterThan(0);
    expectVideo(pager.results[0]!);

    pager.nextPage!();
    expect(env.requests.some((r) => r.url === SEARCH_PAGE2)).toBe(true);
    expect(pager.results.length).toBeGreaterThan(0);
  });

  test("search suggestions are empty (no endpoint on the site)", async () => {
    await preload();
    const env = await makeEnv();
    expect(env.source.searchSuggestions!("sissy")).toEqual([]);
  });

  test("video details carry title, author, source, rating and metadata", async () => {
    await preload();
    const env = await makeEnv();
    const details = expectVideoDetails(env.source.getContentDetails!(VIDEO_URL)) as unknown as Record<string, unknown>;

    expect(details["name"]).toBe("Sissy Hypno Slut - Follow Your Dreams");
    const author = details["author"] as { name?: string; url?: string } | undefined;
    expect(author?.name).toBe("SissyHypno");
    expect(author?.url).toBe("https://sissyhypno.com/user/sissyhypno-2/");
    expect(details["duration"]).toBe(378); // 06:18
    expect(details["viewCount"]).toBe(415);
    expect(details["datetime"]).toBe(Math.floor(Date.UTC(2026, 7, 16, 12, 36, 48) / 1000));
    expect(details["description"]).toContain("Let men use your body");
    expect(details["description"]).toContain("Tags: mtg619");
    expect(details["description"]).toContain("Categories: Anal");
    const rating = details["rating"] as { likes?: number; dislikes?: number } | undefined;
    expect(rating?.likes).toBe(1);
    expect(rating?.dislikes).toBe(0);
    const sources = (details["video"] as { videoSources: { url: string; container: string }[] }).videoSources;
    expect(sources).toHaveLength(1);
    expect(sources[0]!.url).toContain("/media/videos/");
    expect(sources[0]!.container).toBe("video/mp4");
    expect(details["isLive"]).toBe(false);
  });

  test("details object and source both expose related videos", async () => {
    await preload();
    const env = await makeEnv();
    const details = expectVideoDetails(env.source.getContentDetails!(VIDEO_URL));

    const fromDetails = expectPager((details as unknown as { getContentRecommendations: () => VideoPager }).getContentRecommendations(), "VideoPager");
    expect(fromDetails.results.length).toBeGreaterThan(0);
    expectVideo(fromDetails.results[0]!);

    const fromSource = expectPager(env.source.getContentRecommendations!(VIDEO_URL), "VideoPager");
    expect(fromSource.results.length).toBe(fromDetails.results.length);
  });

  test("comments parse authors, messages and relative dates", async () => {
    await preload();
    const env = await makeEnv();
    const pager = expectPager(env.source.getComments!(COMMENTS_VIDEO_URL), "CommentPager");
    expect(pager.results.length).toBe(21);
    expectComment(pager.results[0]!);
    const first = pager.results[0]! as unknown as { author: { name: string; url: string }; message: string; date: number };
    expect(first.author.name).toBe("PaulaFox");
    expect(first.author.url).toBe("https://sissyhypno.com/user/paulafox-9404/");
    expect(first.message.length).toBeGreaterThan(0);
    expect(first.date).toBeGreaterThan(0);
  });

  test("comments for a video without any come back empty", async () => {
    await preload();
    const env = await makeEnv();
    const url = "https://sissyhypno.com/templates/default_tube2016/template.ajax_comments.php?id=16461966";
    cache.set(url, "There are no comments for this video. Please leave your feedback and be the first!");
    const pager = expectPager(env.source.getComments!(VIDEO_URL), "CommentPager");
    expect(pager.results).toHaveLength(0);
    expect(pager.hasMore).toBe(false);
  });

  test("channel pages parse profile info", async () => {
    await preload();
    const env = await makeEnv();
    expect(env.source.isChannelUrl!(CHANNEL_URL)).toBe(true);
    expect(env.source.isChannelUrl!(VIDEO_URL)).toBe(false);

    const channel = expectChannel(env.source.getChannel!(CHANNEL_URL));
    expect(channel.name).toBe("SissyHypno");
    expect(channel.thumbnail).toContain("/media/misc/");
  });

  test("channel contents page through uploads-by-user", async () => {
    await preload();
    const env = await makeEnv();
    const pager = expectPager(env.source.getChannelContents!(CHANNEL_URL, Type.Feed.Mixed, null, {}), "VideoPager");
    expect(pager.results.length).toBeGreaterThan(0);
    expectVideo(pager.results[0]!);

    pager.nextPage!();
    expect(pager.results).toHaveLength(0);
    expect(pager.hasMore).toBe(false);
    expect(env.requests.some((r) => r.url === CHANNEL_UPLOADS_PAGE2)).toBe(true);
  });

  test("url classifiers", async () => {
    await preload();
    const env = await makeEnv();
    expect(env.source.isContentDetailsUrl!(VIDEO_URL)).toBe(true);
    expect(env.source.isContentDetailsUrl!("https://sissyhypno.com/most-recent/")).toBe(false);
    expectContent(env.source.getContentDetails!(VIDEO_URL));
  });
});
