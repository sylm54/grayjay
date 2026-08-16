import { describe, expect, test } from "bun:test";
import {
  createPolyfillGlobals,
  PlatformID,
  PlatformVideo,
  VideoPager,
  PlatformAuthorLink,
  Thumbnails,
  Thumbnail,
  ScriptException,
  ScriptLoginRequiredException,
  UnavailableException,
  type PlatformVideo as PlatformVideoShape,
  type VideoPager as VideoPagerShape,
} from "./polyfill.js";
import { Type, Language } from "./types.js";

describe("polyfill globals", () => {
  test("definePlugin assigns methods onto source", () => {
    const globals = createPolyfillGlobals();
    const definePlugin = globals.definePlugin as (def: Record<string, unknown>) => void;
    const source = globals.source as Record<string, () => unknown>;
    definePlugin({
      getHome: () => new (globals.VideoPager as new (r: unknown[], m: boolean) => unknown)([], false),
    });
    expect(typeof source.getHome).toBe("function");
    const result = source.getHome!() as { plugin_type: string };
    expect(result.plugin_type).toBe("VideoPager");
  });

  test("log forwards strings and JSON-ifies objects", () => {
    const lines: string[] = [];
    const globals = createPolyfillGlobals({ log: (l) => lines.push(l) });
    (globals.log as (v: unknown) => void)("hello");
    (globals.log as (v: unknown) => void)({ a: 1 });
    expect(lines[0]).toBe("hello");
    expect(JSON.parse(lines[1]!)).toEqual({ a: 1 });
  });
});

describe("polyfill contract (must mirror engine source.js)", () => {
  test("PlatformVideo applies engine defaults", () => {
    const id = new PlatformID("Test", "abc", "plugin-1");
    const video = new PlatformVideo({ id, name: "A video", url: "https://example.com/v/abc" });
    expect(video.plugin_type).toBe("PlatformVideo");
    expect(video.contentType).toBe(1);
    expect(video.duration).toBe(-1);
    expect(video.viewCount).toBe(-1);
    expect(video.isLive).toBe(false);
    expect(video.isShort).toBe(false);
    expect(video.datetime).toBe(0);
    expect((video.thumbnails as Thumbnails).sources).toEqual([]);
    expect(video.id.value).toBe("abc");
  });

  test("PlatformVideo accepts uploadDate alias for datetime", () => {
    const video = new PlatformVideo({ uploadDate: 1696880568 });
    expect(video.datetime).toBe(1696880568);
  });

  test("VideoPager defaults", () => {
    const pager = new VideoPager([], true);
    expect(pager.plugin_type).toBe("VideoPager");
    expect(pager.context).toEqual({});
    expect(pager.hasMorePagers()).toBe(true);
  });

  test("subclass pager pattern works", () => {
    let calls = 0;
    class MyPager extends VideoPager {
      constructor() {
        super([], true, { page: 1 });
      }
      override nextPage() {
        calls++;
        this.results = [];
        this.hasMore = false;
        return this;
      }
    }
    const pager = new MyPager();
    expect(pager.context).toEqual({ page: 1 });
    pager.nextPage();
    expect(calls).toBe(1);
    expect(pager.hasMore).toBe(false);
  });

  test("author link optional fields", () => {
    const author = new PlatformAuthorLink(new PlatformID("T", "a"), "Name", "https://x.test/a");
    expect(author.membershipUrl).toBeUndefined();
    const author2 = new PlatformAuthorLink(new PlatformID("T", "a"), "Name", "https://x.test/a", "thumb", 42, "https://join");
    expect(author2.subscribers).toBe(42);
    expect(author2.membershipUrl).toBe("https://join");
  });

  test("thumbnails", () => {
    const t = new Thumbnails([new Thumbnail("https://t/1.png", 720)]);
    expect(t.sources[0]!.quality).toBe(720);
  });

  test("exceptions carry plugin_type discriminators", () => {
    expect(new ScriptException("boom").plugin_type).toBe("ScriptException");
    expect(new ScriptLoginRequiredException("login!").plugin_type).toBe("ScriptLoginRequiredException");
    expect(new UnavailableException("gone").plugin_type).toBe("UnavailableException");
  });

  test("Type/Language constants match engine values", () => {
    expect(Type.Feed.Mixed).toBe("MIXED");
    expect(Type.Order.Chronological).toBe("CHRONOLOGICAL");
    expect(Type.Text.HTML).toBe(1);
    expect(Language.UNKNOWN).toBe("Unknown");
  });
});

// Compile-time guarantees that polyfill instances satisfy the structural
// contract types used across the toolchain.
describe("structural contract", () => {
  test("polyfill PlatformVideo satisfies wire type", () => {
    const video = new PlatformVideo({ name: "x", url: "u" });
    const shape: PlatformVideoShape = video;
    expect(shape.plugin_type).toBe("PlatformVideo");
  });

  test("polyfill VideoPager satisfies wire type", () => {
    const pager = new VideoPager([], false);
    const shape: VideoPagerShape = pager;
    expect(shape.hasMore).toBe(false);
  });
});
