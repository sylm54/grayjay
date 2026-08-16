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

const VIDEO_URL = "https://hypnotube.com/video/whiteboi-life-139973.html";
const USER_URL = "https://hypnotube.com/user/niqqadick-284360/";
const PLAYLIST_URL = "https://hypnotube.com/playlist/200587/premature-uncensored/";

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
  cache.set("age-gate-fixture", await fixtureText("age-gate.html"));
  cache.set("https://hypnotube.com/", await fixtureText("most-recent.html"));
  cache.set("https://hypnotube.com/most-recent/", await fixtureText("most-recent.html"));
  cache.set("https://hypnotube.com/most-recent/page2.html", await fixtureText("most-recent-page2.html"));
  cache.set("https://hypnotube.com/top-rated/", await fixtureText("most-recent.html"));
  cache.set("https://hypnotube.com/most-viewed/month/", await fixtureText("most-recent.html"));
  cache.set("https://hypnotube.com/search/videos/sissy/", await fixtureText("search.html"));
  cache.set("https://hypnotube.com/search/videos/sissy/newest/", await fixtureText("search.html"));
  cache.set("https://hypnotube.com/search/videos/sissy/newest/page2.html", await fixtureText("search-page2.html"));
  cache.set(VIDEO_URL, await fixtureText("video-page.html"));
  cache.set("https://hypnotube.com/templates/hypnotube/template.ajax_comments.php?id=139973", await fixtureText("comments.html"));
  cache.set(USER_URL, await fixtureText("user-page.html"));
  cache.set("https://hypnotube.com/uploads-by-user/284360/", await fixtureText("user-uploads.html"));
  cache.set(PLAYLIST_URL, await fixtureText("playlist-page.html"));
}

/** When gated=true the session's first GET serves the age-gate page. */
const gate = { gated: true };

async function makeEnv(settings: Record<string, string> = {}): Promise<PluginEnv> {
  gate.gated = true;
  return await loadPlugin({
    config: join(import.meta.dir, "..", "grayjay.config.ts"),
    script: join(import.meta.dir, "..", "dist", "HypnotubeScript.js"),
    settings,
    http: {
      mock: (req) => {
        if (req.method === "POST" && req.url.endsWith("/age-gate")) {
          gate.gated = false;
          return {
            code: 200,
            body: JSON.stringify({ blocked: false, redirect: "https://hypnotube.com/" }),
            headers: { "Set-Cookie": "PHPSESSID=gatepassed" },
          };
        }
        if (req.method === "POST" && req.url.endsWith("/searchgate.php")) {
          // The engine follows the 302, so the POST response IS the results page.
          const q = decodeURIComponent((req.body ?? "").match(/q=([^&]*)/)?.[1] ?? "");
          const sort = (req.body ?? "").includes("sort=") ? "" : ""; // sort rides on the GET urls
          const key = `https://hypnotube.com/search/videos/${q}/`;
          return { code: 200, body: readSync(cache.has(key) ? key : "https://hypnotube.com/search/videos/sissy/"), headers: {} };
        }
        if (gate.gated) {
          return { code: 200, body: readSync("age-gate-fixture"), headers: { "Set-Cookie": "PHPSESSID=fresh" } };
        }
        return { code: 200, body: readSync(req.url), headers: {} };
      },
    },
  });
}

describe("Hypnotube", () => {
  test("passes the age gate transparently and loads the home feed", async () => {
    await preload();
    const env = await makeEnv();
    const pager = expectPager(env.source.getHome(), "VideoPager");
    expect(pager.results.length).toBeGreaterThan(0);
    expectVideo(pager.results[0]!);
    expect(pager.hasMore).toBe(true);
    // The gate POST happened exactly once for the whole session.
    expect(env.requests.filter((r) => r.url.endsWith("/age-gate")).length).toBe(1);
  });

  test("home feed paginates via pageN.html", async () => {
    await preload();
    const env = await makeEnv();
    const pager = expectPager(env.source.getHome(), "VideoPager");
    const before = env.requests.length;
    pager.nextPage!();
    expect(env.requests.length).toBe(before + 1);
    expect(env.requests.at(-1)!.url).toBe("https://hypnotube.com/most-recent/page2.html");
    expect(pager.results.length).toBeGreaterThan(0);
  });

  test("home feed honors the sort + timeframe settings", async () => {
    await preload();
    const env = await makeEnv({ "Home feed": "3", "Home feed timeframe": "3" });
    env.source.getHome();
    expect(env.requests.some((r) => r.url === "https://hypnotube.com/most-viewed/month/")).toBe(true);
  });

  test("search paginates and maps the chronological order", async () => {
    await preload();
    const env = await makeEnv();
    const pager = expectPager(env.source.search("sissy", Type.Feed.Mixed, Type.Order.Chronological, {}), "VideoPager");
    // Page 1 is the searchgate POST's redirect landing.
    const post = env.requests.find((r) => r.url.endsWith("/searchgate.php"));
    expect(post?.body).toContain("q=sissy");
    expect(pager.results.length).toBeGreaterThan(0);
    pager.nextPage!();
    expect(env.requests.at(-1)!.url).toBe("https://hypnotube.com/search/videos/sissy/newest/page2.html");
  });

  test("video details: sources, author, metadata, rating, description", async () => {
    await preload();
    const env = await makeEnv();
    const { video, description } = expectVideoDetails(env.source.getContentDetails(VIDEO_URL));
    const details = env.source.getContentDetails(VIDEO_URL) as unknown as Record<string, unknown>;
    expect(details["name"]).toBe("WhiteBoi Life");
    expect(details["duration"]).toBe(303);
    expect(details["viewCount"]).toBeGreaterThan(0);
    expect(details["datetime"] as number).toBeGreaterThan(0);
    const author = details["author"] as Record<string, unknown> | undefined;
    expect(author?.["name" as string] ?? author?.["name"]).toBe("Niqqadick");
    expect(video.videoSources.length).toBeGreaterThan(0);
    expect(description).toContain("#vertical");
    expect(details["rating"]).toBeDefined();
  });

  test("video details exposes recommendations", async () => {
    await preload();
    const env = await makeEnv();
    const details = env.source.getContentDetails(VIDEO_URL) as unknown as {
      getContentRecommendations?: () => unknown;
    };
    expect(typeof details.getContentRecommendations).toBe("function");
    const pager = expectPager(details.getContentRecommendations!(), "VideoPager");
    expect(pager.results.length).toBeGreaterThan(0);
    expectVideo(pager.results[0]!);
  });

  test("comments load with authors, messages and dates", async () => {
    await preload();
    const env = await makeEnv();
    const pager = expectPager(env.source.getComments(VIDEO_URL), "CommentPager");
    expect(pager.results.length).toBeGreaterThan(2);
    for (const comment of pager.results) expectComment(comment);
    const first = pager.results[0]! as Record<string, unknown>;
    const author = first["author"] as Record<string, unknown>;
    expect(author["name" as string] ?? author["name"]).toBeTruthy();
    expect(first["message"]).toBeTruthy();
    expect(first["date"] as number).toBeGreaterThan(0);
  });

  test("channel page and uploads", async () => {
    await preload();
    const env = await makeEnv();
    expect(env.source.isChannelUrl(USER_URL)).toBe(true);
    const channel = expectChannel(env.source.getChannel(USER_URL));
    expect(channel["name"]).toBe("Niqqadick");

    const pager = expectPager(env.source.getChannelContents(USER_URL), "VideoPager");
    expect(pager.results.length).toBeGreaterThan(0);
    expectVideo(pager.results[0]!);
    expect(env.requests.some((r) => r.url === "https://hypnotube.com/uploads-by-user/284360/")).toBe(true);
  });

  test("playlist page", async () => {
    await preload();
    const env = await makeEnv();
    expect(env.source.isPlaylistUrl(PLAYLIST_URL)).toBe(true);
    const playlist = expectContent(env.source.getPlaylist(PLAYLIST_URL));
    expect(playlist["name"]).toContain("Premature");
    const contents = expectPager(playlist["contents"], "VideoPager");
    expect(contents.results.length).toBeGreaterThan(0);
    expectContent(contents.results[0]!);
  });

  test("non-video urls are rejected", async () => {
    await preload();
    const env = await makeEnv();
    expect(env.source.isContentDetailsUrl(USER_URL)).toBe(false);
    try {
      env.source.getComments(USER_URL);
      expect.unreachable();
    } catch (err) {
      expect(pluginExceptionType(err)).toBe("ScriptException");
    }
  });
});
