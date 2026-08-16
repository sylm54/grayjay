/**
 * Compile-time usage test for the ambient globals: this file is written the
 * way real plugin code is written — no imports, ambient globals only. It is
 * typechecked by `tsc` but never executed.
 */

// --- lifecycle & pagers -----------------------------------------------------

source.enable = (config, settings, savedState) => {
  log(`enabled ${config.name} v${config.version} state=${savedState ?? "none"}`);
  void settings;
};

definePlugin({
  getHome() {
    return new VideoPager(
      [
        new PlatformVideo({
          id: new PlatformID("Test", "v1", plugin.config.id),
          name: "A video",
          thumbnails: new Thumbnails([new Thumbnail("https://t/1.png", 720)]),
          author: new PlatformAuthorLink(new PlatformID("Test", "a1", plugin.config.id), "Author", "https://test/a1"),
          uploadDate: 1696880568,
          duration: 120,
          viewCount: 1000,
          url: "https://test/v/1",
          isLive: false,
        }),
      ],
      false,
      { page: 1 },
    );
  },

  search(query, type, order, filters) {
    if (filters?.["date"]) {
      const date = filters["date"][0];
      log(`search ${query} date=${date ?? "?"} type=${type ?? "*"} order=${order ?? "*"}`);
    }
    return new VideoPager([], false);
  },

  searchSuggestions(query) {
    return [query];
  },

  getSearchCapabilities() {
    return {
      types: [Type.Feed.Mixed],
      sorts: [Type.Order.Chronological, "^release_time"],
      filters: [
        {
          id: "date",
          name: "Date",
          isMultiSelect: false,
          filters: [
            { id: Type.Date.Today, name: "Last 24 hours", value: "today" },
            { id: Type.Date.LastWeek, name: "Last week", value: "thisweek" },
          ],
        },
      ],
    };
  },

  isChannelUrl(url) {
    return /^https:\/\/test\.test\/c\//.test(url);
  },

  getChannel(url) {
    return new PlatformChannel({ name: "Chan", url, subscribers: 10 });
  },

  getChannelContents(url, type, order, filters) {
    log(`contents ${url} ${type ?? "*"}`);
    return new VideoPager([], true, { url, page: 1 });
  },

  isContentDetailsUrl(url) {
    return /^https:\/\/test\.test\/v\//.test(url);
  },

  getContentDetails(url) {
    return new PlatformVideoDetails({
      id: new PlatformID("Test", "v1", plugin.config.id),
      name: "A video",
      url,
      duration: 120,
      isLive: false,
      description: "desc",
      video: new VideoSourceDescriptor([
        new VideoUrlSource({
          width: 1920,
          height: 1080,
          container: "video/mp4",
          codec: "avc1.4d401e",
          name: "1080p",
          bitrate: 188103,
          duration: 120,
          url: "https://cdn.test/1.mp4",
        }),
      ]),
      live: null,
      rating: new RatingLikes(10),
      subtitles: [{ name: "English", url: "https://cdn.test/1.vtt", format: "text/vtt", language: "en" }],
    });
  },

  getComments(url) {
    class CommentsPager extends CommentPager {
      override nextPage(): CommentsPager {
        return new CommentsPager([], false, this.context);
      }
    }
    return new CommentsPager(
      [new PlatformComment({ contextUrl: url, message: "hi", rating: new RatingLikes(1) })],
      true,
      { url },
    );
  },

  getSubComments(comment) {
    const c = typeof comment === "string" ? JSON.parse(comment) : comment;
    return new CommentPager(c.context?.replyIds ? [] : [], false);
  },

  getContentChapters(url) {
    return [{ name: "Intro", timeStart: 0, timeEnd: 30, type: Type.Chapter.NORMAL }];
  },

  getPlaybackTracker(url) {
    class Tracker extends PlaybackTracker {
      override setProgress(seconds: number): void {
        http.POST("https://test.test/progress", JSON.stringify({ url, seconds }), {}, true);
      }
    }
    return new Tracker(30_000);
  },

  saveState() {
    return JSON.stringify({ startedAt: Date.now() });
  },
});

// --- packages ----------------------------------------------------------------

const resp = http.GET("https://test.test/api", { accept: "application/json" });
if (!resp.isOk) {
  throw new ScriptException(`Request failed: ${resp.code}`);
}
const data: unknown = JSON.parse(resp.body);

const batched = http
  .batch()
  .GET("https://test.test/a")
  .POST("https://test.test/b", "{}", { "content-type": "application/json" }, true)
  .execute();

const custom = http.newClient(true);
custom.setDefaultHeaders({ origin: "https://test.test" });

const id: string = utility.randomUUID();
const hash: string = utility.md5String("x");
const bytes: Uint8Array = utility.fromBase64("aGk=");
const b64: string = utility.toBase64(new Uint8Array([1, 2, 3]));

if (bridge.buildPlatform === "android") {
  log(`android v${bridge.buildVersion}`);
}
bridge.toast("hello");
bridge.sleep(10);

// DOMParser is available when "DOMParser" is in config packages.
const node = domParser.parseFromString("<html><body><p class=x>hi</p></body></html>");
const para = node.querySelector("p.x");
log(para?.textContent ?? "missing");

// Exceptions
function throwers(): never {
  throw new ScriptLoginRequiredException("login required");
}

// UnMuxed descriptor + range sources
const details = new PlatformVideoDetails({
  url: "https://test.test/v/2",
  video: new UnMuxVideoSourceDescriptor(
    [new VideoUrlRangeSource({ width: 1280, height: 720, url: "https://cdn.test/v", initStart: 0, initEnd: 219 })],
    [new AudioUrlRangeSource({ url: "https://cdn.test/a", bitrate: 128000, audioChannels: 2 })],
  ),
});
log(`${details.video.isUnMuxed} ${(details.video as UnMuxVideoSourceDescriptor).audioSources.length}`);

// HLS/Dash live
new PlatformVideoDetails({
  url: "https://test.test/live",
  isLive: true,
  live: new HLSSource({ url: "https://cdn.test/live.m3u8", priority: true }),
});

// Type-level negative checks (must fail to compile if uncommented):
// source.typo = () => {};                     // excess property
// definePlugin({ getHom() {} });              // method typo
// new PlatformVideo({ duration: "120" });     // wrong type
// const bad: number = Type.Text.HTML;         // wrong type
void [data, batched, id, hash, bytes, b64, throwers];
