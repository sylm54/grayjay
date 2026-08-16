/**
 * FeedDemo plugin — deterministic synthetic platform.
 *
 * This file is written exactly the way a real plugin is: ambient engine
 * globals (source, http, Type, PlatformVideo, …), no imports. `gj build`
 * compiles it into a single classic script for the Grayjay engine.
 *
 * The demo "API" (api.feeddemo.test) is mocked in tests and can be served by
 * `examples/feed-demo/dev-server.ts` for on-device testing.
 */

const PLATFORM = "FeedDemo";
const API = "https://api.feeddemo.test";

const AUTHOR = () =>
  new PlatformAuthorLink(
    new PlatformID(PLATFORM, "channel-main", plugin.config.id),
    "FeedDemo Channel",
    "https://feeddemo.test/channel",
    "https://api.feeddemo.test/avatar.png",
    12_345,
  );

interface DemoVideo {
  id: string;
  title: string;
  seconds: number;
  live: boolean;
  likes: number;
}

/** Deterministic pseudo-random from a string seed. */
function seeded(seed: string, index: number): number {
  let hash = 2166136261;
  const input = `${seed}:${index}`;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function videosForPage(feed: string, page: number, pageSize: number): DemoVideo[] {
  const items: DemoVideo[] = [];
  const start = (page - 1) * pageSize;
  for (let i = 0; i < pageSize; i++) {
    const index = start + i;
    const rand = seeded(feed, index);
    items.push({
      id: `${feed}-${index + 1}`,
      title: `${feed} video #${index + 1}`,
      seconds: 30 + (rand % 600),
      live: feed === "home" && index === 0 && settingsBool("Include live", true),
      likes: rand % 5000,
    });
  }
  return items;
}

function settingsBool(name: string, fallback: boolean): boolean {
  const value = (plugin.settings as Record<string, unknown>)[name];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  return fallback;
}

function feedPageSize(): number {
  const raw = (plugin.settings as Record<string, unknown>)["Feed size"];
  const parsed = typeof raw === "string" ? Number.parseInt(raw, 10) : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

function makeVideo(item: DemoVideo): PlatformVideo {
  return new PlatformVideo({
    id: new PlatformID(PLATFORM, item.id, plugin.config.id),
    name: item.title,
    author: AUTHOR(),
    uploadDate: 1700000000 + seeded(item.id, 1) % 10_000_000,
    duration: item.live ? -1 : item.seconds,
    viewCount: seeded(item.id, 2) % 100_000,
    url: `https://feeddemo.test/watch/${item.id}`,
    thumbnails: new Thumbnails([
      new Thumbnail(`https://api.feeddemo.test/thumb/${item.id}-360.png`, 360),
      new Thumbnail(`https://api.feeddemo.test/thumb/${item.id}-720.png`, 720),
    ]),
    isLive: item.live,
  });
}

/** Demonstrates the recommended pager: mutate self, return this. */
class FeedPager extends VideoPager {
  private readonly feed: string;

  constructor(feed: string, results: PlatformVideo[], hasMore: boolean, page: number) {
    super(results, hasMore, { feed, page });
    this.feed = feed;
  }

  override nextPage(): FeedPager {
    const page = ((this.context as { page: number }).page ?? 1) + 1;
    const items = videosForPage(this.feed, page, feedPageSize());
    this.results = items.map(makeVideo);
    this.hasMore = page < 3; // three pages of demo content
    (this.context as { page: number }).page = page;
    return this;
  }
}

function fetchWithHttp(path: string): unknown {
  // Demonstrates the Http package; the demo data itself is generated locally,
  // but the request flow (allowUrls, response handling) is what matters here.
  const resp = http.GET(`${API}${path}`, { accept: "application/json" }, false);
  if (!resp.isOk) {
    throw new ScriptException(`${path} failed with ${resp.code}`);
  }
  return JSON.parse(resp.body);
}

definePlugin({
  enable(config, settings, savedState) {
    log(`FeedDemo enabled (v${config.version}), settings: ${JSON.stringify(settings)}`);
    if (savedState) {
      log(`restored state: ${savedState}`);
    }
  },

  saveState() {
    return JSON.stringify({ lastSeen: Date.now() });
  },

  getHome() {
    // Touch the "API" so tests exercise the http mock, then serve local data.
    fetchWithHttp("/v1/hello");
    const pageSize = feedPageSize();
    return new FeedPager("home", videosForPage("home", 1, pageSize).map(makeVideo), true, 1);
  },

  getShorts() {
    const shorts = videosForPage("shorts", 1, feedPageSize())
      .filter((v) => v.seconds <= 60)
      .map(makeVideo);
    return new VideoPager(shorts, false, {});
  },

  searchSuggestions(query) {
    return [query, `${query} in 2026`, `${query} tutorial`];
  },

  getSearchCapabilities() {
    return {
      types: [Type.Feed.Videos, Type.Feed.Mixed],
      sorts: [Type.Order.Chronological, "^release_time"],
      filters: [
        {
          id: "duration",
          name: "Duration",
          isMultiSelect: false,
          filters: [
            { id: Type.Duration.Short, name: "Short", value: "short" },
            { id: Type.Duration.Medium, name: "Medium", value: "medium" },
            { id: Type.Duration.Long, name: "Long", value: "long" },
          ],
        },
      ],
    };
  },

  search(query, type, order, filters) {
    log(`search: q=${JSON.stringify(query)} type=${JSON.stringify(type)} order=${JSON.stringify(order)}`);
    const durationFilter = filters?.["duration"]?.[0];
    const pageSize = feedPageSize();
    let videos = videosForPage(`search:${query}`, 1, pageSize);
    if (durationFilter === "short") videos = videos.filter((v) => v.seconds <= 60);
    if (durationFilter === "long") videos = videos.filter((v) => v.seconds > 300);
    return new VideoPager(videos.map(makeVideo), false, { query, type: type ?? "", order: order ?? "" });
  },

  searchChannels(query) {
    return new ChannelPager(
      [
        new PlatformChannel({
          id: `channel-${query.toLowerCase()}`,
          name: `Channel "${query}"`,
          url: `https://feeddemo.test/channel?q=${encodeURIComponent(query)}`,
          subscribers: 1000,
          thumbnail: "https://api.feeddemo.test/avatar.png",
        }),
      ],
      false,
      { query },
    );
  },

  isChannelUrl(url) {
    return url.startsWith("https://feeddemo.test/channel");
  },

  getChannel(url) {
    return new PlatformChannel({
      id: "channel-main",
      name: "FeedDemo Channel",
      url,
      thumbnail: "https://api.feeddemo.test/avatar.png",
      banner: "https://api.feeddemo.test/banner.png",
      subscribers: 12_345,
      description: "The one and only FeedDemo channel.",
      links: { Web: "https://feeddemo.test" },
    });
  },

  getChannelContents(url, type) {
    return new FeedPager(`channel:${url}`, videosForPage("channel", 1, feedPageSize()).map(makeVideo), true, 1);
  },

  isContentDetailsUrl(url) {
    return /^https:\/\/feeddemo\.test\/watch\/[a-z0-9-]+$/i.test(url);
  },

  getContentDetails(url) {
    const id = url.split("/").pop() ?? "";
    if (id.includes("members-only")) {
      throw new ScriptLoginRequiredException("This item is for members only — log in to FeedDemo.");
    }
    if (id.includes("gone")) {
      throw new UnavailableException("This item was removed from the demo platform.");
    }

    const item: DemoVideo = {
      id,
      title: `FeedDemo ${id}`,
      seconds: 60 + (seeded(id, 3) % 1800),
      live: id.startsWith("home-0"),
      likes: seeded(id, 4) % 10_000,
    };

    return new PlatformVideoDetails({
      id: new PlatformID(PLATFORM, id, plugin.config.id),
      name: item.title,
      author: AUTHOR(),
      uploadDate: 1700000000 + (seeded(id, 1) % 10_000_000),
      duration: item.live ? -1 : item.seconds,
      viewCount: seeded(id, 2) % 100_000,
      url,
      isLive: item.live,
      thumbnails: new Thumbnails([new Thumbnail(`https://api.feeddemo.test/thumb/${id}-720.png`, 720)]),
      description: `Deterministic demo content for ${id}.\nGenerated by the FeedDemo example plugin.`,
      video: new VideoSourceDescriptor([
        new VideoUrlSource({
          width: 1920,
          height: 1080,
          container: "video/mp4",
          codec: "avc1.4d401e",
          name: "1080p",
          bitrate: 2_500_000,
          duration: item.seconds,
          url: `https://api.feeddemo.test/stream/${id}-1080.mp4`,
        }),
        new VideoUrlSource({
          width: 1280,
          height: 720,
          container: "video/mp4",
          codec: "avc1.4d401e",
          name: "720p",
          bitrate: 1_200_000,
          duration: item.seconds,
          url: `https://api.feeddemo.test/stream/${id}-720.mp4`,
        }),
      ]),
      live: item.live
        ? new HLSSource({ name: "Live HLS", url: `https://api.feeddemo.test/live/${id}/index.m3u8`, priority: true })
        : null,
      rating: new RatingLikes(item.likes),
      subtitles: [{ name: "English", url: `https://api.feeddemo.test/subs/${id}.vtt`, format: "text/vtt", language: "en" }],
    });
  },

  getContentChapters(url) {
    return [
      { name: "Intro", timeStart: 0, timeEnd: 30, type: Type.Chapter.NORMAL },
      { name: "Main", timeStart: 30, timeEnd: 300, type: Type.Chapter.NORMAL },
    ];
  },

  getComments(url) {
    class DemoCommentsPager extends CommentPager {
      override nextPage(): DemoCommentsPager {
        return new DemoCommentsPager([], false, this.context as Record<string, unknown>);
      }
    }
    return new DemoCommentsPager(
      [
        new PlatformComment({
          contextUrl: url,
          author: AUTHOR(),
          message: "First! (deterministic)",
          rating: new RatingLikes(seeded(url, 5) % 100),
          date: 1700000000,
          replyCount: 1,
          context: { parentId: null },
        }),
      ],
      false,
      { url },
    );
  },

  getSubComments(comment) {
    const parsed = typeof comment === "string" ? JSON.parse(comment) : comment;
    const contextUrl = parsed?.contextUrl ?? "";
    return new CommentPager(
      [
        new PlatformComment({
          contextUrl,
          author: AUTHOR(),
          message: "A deterministic reply",
          rating: new RatingLikes(1),
          date: 1700000001,
          replyCount: 0,
          context: { parentId: parsed?.context?.parentId ?? null },
        }),
      ],
      false,
      {},
    );
  },

  isPlaylistUrl(url) {
    return url.startsWith("https://feeddemo.test/playlist/");
  },

  getPlaylist(url) {
    const id = url.split("/").pop() ?? "demo";
    return new PlatformPlaylistDetails({
      id: new PlatformID(PLATFORM, `playlist-${id}`, plugin.config.id),
      name: `Playlist ${id}`,
      author: AUTHOR(),
      url,
      datetime: 1700000000,
      videoCount: feedPageSize(),
      thumbnail: `https://api.feeddemo.test/thumb/${id}-720.png`,
      contents: new VideoPager(videosForPage(`playlist:${id}`, 1, feedPageSize()).map(makeVideo), false, {}),
    });
  },

  getPlaybackTracker(url) {
    class DemoTracker extends PlaybackTracker {
      override setProgress(seconds: number): void {
        log(`playback progress ${url}: ${seconds}s`);
      }
    }
    return new DemoTracker(30_000);
  },
});
