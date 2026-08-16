/**
 * Ambient declarations for the Grayjay plugin runtime.
 *
 * Reference these from your plugin's tsconfig:
 *   "types": ["@grayjay/runtime/globals"]
 * or with a triple-slash reference in a .d.ts of your own.
 *
 * Everything declared here is provided by the Grayjay app at runtime
 * (`source.js` polyfill + engine packages). Nothing needs to be imported or
 * bundled — that is what keeps plugin output dependency-free.
 */

import type {
  AudioUrlRangeSourceInit,
  AudioUrlSourceInit,
  AudioUrlWidevineSourceInit,
  DashManifestRawAudioSourceInit,
  DashManifestRawSourceInit,
  DashSourceInit,
  HLSSourceInit,
  PagerContext,
  PlatformArticleDetailsInit,
  PlatformArticleInit,
  PlatformChannelInit,
  PlatformCommentInit,
  PlatformLockedContentInit,
  PlatformNestedMediaContentInit,
  PlatformPlaylistDetailsInit,
  PlatformPlaylistInit,
  PlatformPostDetailsInit,
  PlatformPostInit,
  PlatformVideoDetailsInit,
  PlatformVideoInit,
  PluginDefinition,
  PluginSettings,
  Rating,
  Source,
  SourcePluginRuntimeConfig,
  SourceRequestModifier,
  Subtitle,
  TextType,
  UMPSourceInit,
  UnixTimestamp,
  VideoUrlRangeSourceInit,
  VideoUrlSourceInit,
  VideoUrlWidevineSourceInit,
} from "./types.js";
import type {
  BridgePackage,
  DomParserPackage,
  HttpPackage,
  UtilitiesPackage,
} from "./packages.js";

declare global {
  /* -- polyfill globals ---------------------------------------------------- */

  /** True when the plugin runs under a testing harness instead of the app. */
  var IS_TESTING: boolean;

  /** Engine enum constants: feed types, orders, dates, text types, chapters. */
  const Type: {
    readonly Source: { readonly Dash: "DASH"; readonly HLS: "HLS"; readonly STATIC: "Static" };
    readonly Feed: {
      readonly Videos: "VIDEOS";
      readonly Streams: "STREAMS";
      readonly Mixed: "MIXED";
      readonly Live: "LIVE";
      readonly Subscriptions: "SUBSCRIPTIONS";
      readonly Shorts: "SHORTS";
    };
    readonly Order: { readonly Chronological: "CHRONOLOGICAL" };
    readonly Date: {
      readonly LastHour: "LAST_HOUR";
      readonly Today: "TODAY";
      readonly LastWeek: "LAST_WEEK";
      readonly LastMonth: "LAST_MONTH";
      readonly LastYear: "LAST_YEAR";
    };
    readonly Duration: { readonly Short: "SHORT"; readonly Medium: "MEDIUM"; readonly Long: "LONG" };
    readonly Text: { readonly RAW: 0; readonly HTML: 1; readonly MARKUP: 2; readonly CODE: 3 };
    readonly Chapter: { readonly NORMAL: 0; readonly SKIPPABLE: 5; readonly SKIP: 6; readonly SKIPONCE: 7 };
  };

  /** ISO 639-1 codes with an `Unknown` sentinel. */
  const Language: {
    readonly UNKNOWN: "Unknown";
    readonly ARABIC: "ar";
    readonly SPANISH: "es";
    readonly FRENCH: "fr";
    readonly HINDI: "hi";
    readonly INDONESIAN: "id";
    readonly KOREAN: "ko";
    readonly PORTUGUESE: "pt";
    readonly PORTBRAZIL: "pt";
    readonly RUSSIAN: "ru";
    readonly THAI: "th";
    readonly TURKISH: "tr";
    readonly VIETNAMESE: "vi";
    readonly ENGLISH: "en";
  };

  /** Log to the app logcat / desktop log (use this, not console). */
  function log(message?: unknown): void;

  /** The plugin's runtime config and resolved settings. */
  const plugin: {
    config: SourcePluginRuntimeConfig;
    settings: Record<string, unknown>;
  };

  /**
   * THE plugin object. Assign the methods your platform supports:
   *   source.getHome = () => new VideoPager([...], false);
   * or use `definePlugin({ ... })` for a single typed literal.
   */
  const source: Source;

  /**
   * Declare all your plugin methods in one typed object literal. Typos in
   * method names fail at compile time. Injected by `gj build` (and available
   * under the test harness); assigns each method onto `source`.
   */
  function definePlugin<T extends PluginDefinition>(definition: T): void;

  /** Timers are provided by the bridge package (always loaded). */
  function setTimeout(callback: () => void, ms?: number): number;
  function clearTimeout(id: number): void;

  var console: { log(...data: unknown[]): void; warn(...data: unknown[]): void; error(...data: unknown[]): void };
  function btoa(data: string): string;
  function atob(data: string): string;
  class URLSearchParams {
    constructor(init?: string | Record<string, string>);
    append(name: string, value: string): void;
    delete(name: string): void;
    get(name: string): string | null;
    getAll(name: string): string[];
    has(name: string): boolean;
    set(name: string, value: string): void;
    forEach(callback: (value: string, name: string, searchParams: URLSearchParams) => void): void;
    keys(): string[];
    values(): string[];
    toString(): string;
  }

  /* -- engine packages ------------------------------------------------------ */

  /** Http package — requires `"Http"` in config `packages`. */
  const http: HttpPackage;
  /** Bridge package — always available. */
  const bridge: BridgePackage;
  /** Utilities package — requires `"Utilities"` in config `packages`. */
  const utility: UtilitiesPackage;
  /** DOMParser package — requires `"DOMParser"` in config `packages`. */
  const domParser: DomParserPackage;

  /* -- exceptions ----------------------------------------------------------- */

  /** Base plugin exception; single-arg form uses type "ScriptException". */
  class ScriptException extends Error {
    constructor(message: string);
    constructor(type: string, message: string);
    plugin_type: string;
    msg: string;
  }
  /** Thrown when the operation requires the user to be logged in. */
  class ScriptLoginRequiredException extends ScriptException {
    constructor(message: string);
  }
  /** Alias of ScriptLoginRequiredException. */
  class LoginRequiredException extends ScriptException {
    constructor(message: string);
  }
  /** Thrown when a captcha must be solved; the app opens `url` in a browser. */
  class CaptchaRequiredException extends Error {
    constructor(url: string, body?: string);
    plugin_type: "CaptchaRequiredException";
    url: string;
    body: string;
  }
  /** Fatal plugin error; the app may disable the plugin. */
  class CriticalException extends ScriptException {
    constructor(message: string);
  }
  /** Content is not available (region blocked, removed, …). */
  class UnavailableException extends ScriptException {
    constructor(message: string);
  }
  /** Ask the app to reload the plugin (e.g. after settings change). */
  class ReloadRequiredException extends ScriptException {
    constructor(message: string, reloadData?: unknown);
    reloadData: unknown;
  }
  /** Content is age-restricted. */
  class AgeException extends ScriptException {
    constructor(message: string);
  }
  /** Operation timed out. */
  class TimeoutException extends ScriptException {
    constructor(message: string);
  }
  /** API misuse the plugin author should fix. */
  class ScriptImplementationException extends ScriptException {
    constructor(message: string);
  }

  /* -- identity, thumbnails, authors ---------------------------------------- */

  class PlatformID {
    constructor(platform: string, id: string, pluginId?: string, claimType?: number, claimFieldType?: number);
    platform: string;
    value: string;
    pluginId?: string;
    claimType: number;
    claimFieldType: number;
  }

  class Thumbnail {
    constructor(url: string, quality: number);
    url: string;
    quality: number;
  }

  class Thumbnails {
    constructor(thumbnails: Thumbnail[]);
    sources: Thumbnail[];
  }

  class PlatformAuthorLink {
    constructor(id: PlatformID, name: string, url: string, thumbnail?: string, subscribers?: number, membershipUrl?: string);
    id: PlatformID;
    name: string;
    url: string;
    thumbnail?: string;
    subscribers?: number;
    membershipUrl?: string | null;
  }

  /* -- ratings --------------------------------------------------------------- */

  class RatingLikes {
    constructor(likes: number);
    type: 1;
    likes: number;
  }
  class RatingLikesDislikes {
    constructor(likes: number, dislikes: number);
    type: 2;
    likes: number;
    dislikes: number;
  }
  class RatingScaler {
    constructor(value: number);
    type: 3;
    value: number;
  }

  /* -- media sources ---------------------------------------------------------- */

  class RequestModifier {
    constructor(init?: { allowByteSkip?: boolean });
    allowByteSkip?: boolean;
  }

  class VideoUrlSource {
    constructor(init: VideoUrlSourceInit);
    plugin_type: "VideoUrlSource" | "VideoUrlRangeSource" | "VideoUrlWidevineSource";
    width: number;
    height: number;
    container: string;
    codec: string;
    name: string;
    bitrate: number;
    duration: number;
    url: string;
    language?: string;
    original?: boolean;
    requestModifier?: SourceRequestModifier;
  }
  class VideoUrlRangeSource extends VideoUrlSource {
    constructor(init: VideoUrlRangeSourceInit);
    override plugin_type: "VideoUrlRangeSource";
    itagId: number | null;
    initStart: number | null;
    initEnd: number | null;
    indexStart: number | null;
    indexEnd: number | null;
  }
  class VideoUrlWidevineSource extends VideoUrlSource {
    constructor(init: VideoUrlWidevineSourceInit);
    override plugin_type: "VideoUrlWidevineSource";
    licenseUri: string;
  }
  class AudioUrlSource {
    constructor(init: AudioUrlSourceInit);
    plugin_type: "AudioUrlSource" | "AudioUrlRangeSource" | "AudioUrlWidevineSource";
    name: string;
    bitrate: number;
    container: string;
    codec: string;
    duration: number;
    url: string;
    language: string;
    requestModifier?: SourceRequestModifier;
  }
  class AudioUrlRangeSource extends AudioUrlSource {
    constructor(init: AudioUrlRangeSourceInit);
    override plugin_type: "AudioUrlRangeSource";
    itagId: number | null;
    initStart: number | null;
    initEnd: number | null;
    indexStart: number | null;
    indexEnd: number | null;
    audioChannels: number;
  }
  class AudioUrlWidevineSource extends AudioUrlSource {
    constructor(init: AudioUrlWidevineSourceInit);
    override plugin_type: "AudioUrlWidevineSource";
    licenseUri: string;
  }
  class HLSSource {
    constructor(init: HLSSourceInit);
    plugin_type: "HLSSource";
    name: string;
    duration: number;
    url: string;
    priority: boolean;
    language?: string;
    original?: boolean;
    requestModifier?: SourceRequestModifier;
  }
  class DashSource {
    constructor(init: DashSourceInit);
    plugin_type: "DashSource" | "DashWidevineSource";
    name: string;
    duration: number;
    url: string;
    language?: string;
    original?: boolean;
    requestModifier?: SourceRequestModifier;
  }
  class DashWidevineSource extends DashSource {
    constructor(init: DashSourceInit & { licenseUri: string });
    override plugin_type: "DashWidevineSource";
    licenseUri: string;
  }
  class DashManifestRawSource {
    constructor(init: DashManifestRawSourceInit);
    plugin_type: "DashRawSource";
    name: string;
    bitrate: number;
    container: string;
    codec: string;
    duration: number;
    url: string;
    language: string;
    original?: boolean;
    requestModifier?: SourceRequestModifier;
  }
  class DashManifestRawAudioSource {
    constructor(init: DashManifestRawAudioSourceInit);
    plugin_type: "DashRawAudioSource";
    name: string;
    bitrate: number;
    container: string;
    codec: string;
    duration: number;
    url: string;
    language: string;
    manifest: string | null;
    requestModifier?: SourceRequestModifier;
  }
  class UMPSource {
    constructor(init: UMPSourceInit);
    plugin_type: "UMPSource";
    name: string;
    url: string;
    ustreamerConfig?: string;
    videoId: string;
    isLive: boolean;
    duration: number;
    width: number;
    height: number;
    priority: boolean;
    language?: string;
    original?: boolean;
    clientName: number;
    clientVersion: string;
    osName: string;
    osVersion: string;
    videoFormats: string[];
    audioFormats: string[];
    poToken?: string;
    requestModifier?: SourceRequestModifier;
  }

  class VideoSourceDescriptor {
    constructor(videoSources: VideoUrlSource[]);
    constructor(init: { videoSources?: VideoUrlSource[] });
    plugin_type: "MuxVideoSourceDescriptor";
    isUnMuxed: false;
    videoSources: VideoUrlSource[];
  }
  class UnMuxVideoSourceDescriptor {
    constructor(videoSources: VideoUrlSource[], audioSources: AudioUrlSource[]);
    constructor(init: { videoSources?: VideoUrlSource[]; audioSources?: AudioUrlSource[] });
    plugin_type: "UnMuxVideoSourceDescriptor";
    isUnMuxed: true;
    videoSources: VideoUrlSource[];
    audioSources: AudioUrlSource[];
  }

  /* -- content ------------------------------------------------------------------ */

  class PlatformNestedMediaContent {
    constructor(init: PlatformNestedMediaContentInit);
    contentType: 11;
    id: PlatformID;
    name: string;
    thumbnails: Thumbnails;
    author?: PlatformAuthorLink;
    datetime: UnixTimestamp;
    url: string;
    contentUrl: string;
    contentName?: string;
    contentDescription?: string;
    contentProvider?: string;
    contentThumbnails: Thumbnails;
  }
  class PlatformLockedContent {
    constructor(init: PlatformLockedContentInit);
    contentType: 70;
    id: PlatformID;
    name: string;
    thumbnails: Thumbnails;
    author?: PlatformAuthorLink;
    datetime: UnixTimestamp;
    url: string;
    contentName?: string;
    contentThumbnails: Thumbnails;
    unlockUrl: string;
    lockDescription?: string;
  }
  class PlatformVideo {
    constructor(init: PlatformVideoInit);
    contentType: 1;
    plugin_type: "PlatformVideo";
    id: PlatformID;
    name: string;
    thumbnails: Thumbnails;
    author?: PlatformAuthorLink;
    datetime: UnixTimestamp;
    url: string;
    shareUrl?: string;
    duration: number;
    viewCount: number;
    playbackTime: number;
    playbackDate?: number;
    isLive: boolean;
    isShort: boolean;
  }
  class PlatformVideoDetails {
    constructor(init: PlatformVideoDetailsInit);
    contentType: 1;
    plugin_type: "PlatformVideoDetails";
    id: PlatformID;
    name: string;
    thumbnails: Thumbnails;
    author?: PlatformAuthorLink;
    datetime: UnixTimestamp;
    url: string;
    shareUrl?: string;
    duration: number;
    viewCount: number;
    playbackTime: number;
    playbackDate?: number;
    isLive: boolean;
    isShort: boolean;
    description: string;
    video: VideoSourceDescriptor | UnMuxVideoSourceDescriptor;
    /** @deprecated */
    dash: DashSource | null;
    /** @deprecated */
    hls: HLSSource | null;
    live: HLSSource | DashSource | VideoUrlSource | null;
    rating: Rating | null;
    subtitles: Subtitle[];
  }
  class PlatformPost {
    constructor(init: PlatformPostInit);
    contentType: 2;
    plugin_type: "PlatformPost";
    id: PlatformID;
    name: string;
    thumbnails: Thumbnail[] | Thumbnails;
    author?: PlatformAuthorLink;
    datetime: UnixTimestamp;
    url: string;
    images: string[];
    description: string;
  }
  class PlatformPostDetails {
    constructor(init: PlatformPostDetailsInit);
    contentType: 2;
    plugin_type: "PlatformPostDetails";
    id: PlatformID;
    name: string;
    thumbnails: Thumbnail[] | Thumbnails;
    author?: PlatformAuthorLink;
    datetime: UnixTimestamp;
    url: string;
    images: string[];
    description: string;
    rating: Rating;
    textType: TextType;
    content: string;
  }
  class PlatformWeb {
    constructor(init: { url?: string; name?: string; id?: PlatformID });
    contentType: 7;
    plugin_type: "PlatformWeb";
    id: PlatformID;
    name: string;
    author?: PlatformAuthorLink;
    datetime: UnixTimestamp;
    url: string;
  }
  class PlatformWebDetails {
    constructor(init: { url?: string; name?: string; id?: PlatformID; html: string });
    contentType: 7;
    plugin_type: "PlatformWebDetails";
    id: PlatformID;
    name: string;
    author?: PlatformAuthorLink;
    datetime: UnixTimestamp;
    url: string;
    html: string;
  }
  class PlatformArticle {
    constructor(init: PlatformArticleInit);
    contentType: 3;
    plugin_type: "PlatformArticle";
    id: PlatformID;
    name: string;
    thumbnails: Thumbnails;
    author?: PlatformAuthorLink;
    datetime: UnixTimestamp;
    url: string;
    summary: string;
    rating: Rating;
  }
  class ArticleTextSegment {
    constructor(content: string, textType?: TextType);
    type: 1;
    content: string;
    textType?: TextType;
  }
  class ArticleImagesSegment {
    constructor(images: string[], caption?: string);
    type: 2;
    images: string[];
    caption?: string;
  }
  class ArticleHeaderSegment {
    constructor(content: string, level: number);
    type: 3;
    level: number;
    content: string;
  }
  class ArticleNestedSegment {
    constructor(nested: Array<ArticleTextSegment | ArticleImagesSegment | ArticleHeaderSegment | ArticleNestedSegment>);
    type: 9;
    nested: Array<ArticleTextSegment | ArticleImagesSegment | ArticleHeaderSegment | ArticleNestedSegment>;
  }
  class PlatformArticleDetails {
    constructor(init: PlatformArticleDetailsInit);
    contentType: 3;
    plugin_type: "PlatformArticleDetails";
    id: PlatformID;
    name: string;
    thumbnails: Thumbnails;
    author?: PlatformAuthorLink;
    datetime: UnixTimestamp;
    url: string;
    summary: string;
    rating: Rating;
    segments: Array<ArticleTextSegment | ArticleImagesSegment | ArticleHeaderSegment | ArticleNestedSegment>;
  }

  class PlatformChannel {
    constructor(init: PlatformChannelInit);
    plugin_type: "PlatformChannel";
    id: string | PlatformID;
    name: string;
    thumbnail?: string;
    banner?: string;
    subscribers: number;
    description?: string;
    url: string;
    urlAlternatives: string[];
    links: Record<string, string>;
  }

  class PlatformPlaylist {
    constructor(init: PlatformPlaylistInit);
    contentType: 4;
    plugin_type: "PlatformPlaylist";
    id: PlatformID;
    name: string;
    thumbnails: Thumbnails;
    author?: PlatformAuthorLink;
    datetime: UnixTimestamp;
    url: string;
    videoCount: number;
    thumbnail?: string;
  }
  class PlatformPlaylistDetails {
    constructor(init: PlatformPlaylistDetailsInit);
    contentType: 4;
    plugin_type: "PlatformPlaylistDetails";
    id: PlatformID;
    name: string;
    thumbnails: Thumbnails;
    author?: PlatformAuthorLink;
    datetime: UnixTimestamp;
    url: string;
    videoCount: number;
    thumbnail?: string;
    contents: VideoPager;
  }

  class PlatformComment {
    constructor(init: PlatformCommentInit);
    plugin_type: "Comment";
    contextUrl: string;
    author: PlatformAuthorLink;
    message: string;
    rating: Rating;
    date: UnixTimestamp;
    replyCount: number;
    context: Record<string, unknown>;
    getReplies?(): CommentPager;
  }
  /** Backcompat alias of PlatformComment. */
  class Comment extends PlatformComment {
    constructor(init: PlatformCommentInit);
  }

  /* -- playback tracking --------------------------------------------------------- */

  class PlaybackTracker {
    /** @param intervalMs milliseconds between setProgress calls (default 10s). */
    constructor(intervalMs?: number);
    nextRequest: number;
    setProgress(seconds: number): void;
  }

  /* -- live events ------------------------------------------------------------------ */

  class LiveEventPager {
    constructor(results: Array<LiveEventComment | LiveEventEmojis | LiveEventDonation | LiveEventViewCount | LiveEventRaid>, hasMore?: boolean, context?: PagerContext);
    plugin_type: "LiveEventPager";
    results: Array<LiveEventComment | LiveEventEmojis | LiveEventDonation | LiveEventViewCount | LiveEventRaid>;
    hasMore: boolean;
    context: PagerContext;
    nextRequest: number;
    hasMorePagers(): boolean;
    nextPage(): LiveEventPager;
  }
  class LiveEventComment {
    constructor(name: string, message: string, thumbnail?: string, colorName?: string | number, badges?: unknown[]);
    type: 1;
    name: string;
    message: string;
    thumbnail?: string;
    colorName?: string | number;
    badges?: unknown[];
  }
  class LiveEventEmojis {
    constructor(emojis: string[]);
    type: 4;
    emojis: string[];
  }
  class LiveEventDonation {
    constructor(amount: string, name: string, message?: string, thumbnail?: string, expire?: number, colorDonation?: string | number);
    type: 5;
    amount: string;
    name: string;
    message: string;
    thumbnail?: string;
    expire?: number;
    colorDonation?: string | number;
  }
  class LiveEventViewCount {
    constructor(viewCount: number);
    type: 10;
    viewCount: number;
  }
  class LiveEventRaid {
    constructor(targetUrl: string, targetName: string, targetThumbnail?: string, isOutgoing?: boolean);
    type: 100;
    targetUrl: string;
    targetName: string;
    targetThumbnail?: string;
    isOutgoing: boolean;
  }

  /* -- pagers ------------------------------------------------------------------- */

  class ContentPager {
    constructor(
      results: Array<
        PlatformVideo | PlatformVideoDetails | PlatformPost | PlatformNestedMediaContent | PlatformLockedContent | PlatformPlaylist | PlatformArticle | PlatformWeb
      >,
      hasMore?: boolean,
      context?: PagerContext,
    );
    plugin_type: "ContentPager";
    results: Array<
      PlatformVideo | PlatformVideoDetails | PlatformPost | PlatformNestedMediaContent | PlatformLockedContent | PlatformPlaylist | PlatformArticle | PlatformWeb
    >;
    hasMore: boolean;
    context: PagerContext;
    hasMorePagers(): boolean;
    nextPage(): ContentPager;
  }
  class VideoPager {
    constructor(results: Array<PlatformVideo | PlatformVideoDetails>, hasMore?: boolean, context?: PagerContext);
    plugin_type: "VideoPager";
    results: Array<PlatformVideo | PlatformVideoDetails>;
    hasMore: boolean;
    context: PagerContext;
    hasMorePagers(): boolean;
    nextPage(): VideoPager;
  }
  class ChannelPager {
    constructor(results: PlatformChannel[], hasMore?: boolean, context?: PagerContext);
    plugin_type: "ChannelPager";
    results: PlatformChannel[];
    hasMore: boolean;
    context: PagerContext;
    hasMorePagers(): boolean;
    nextPage(): ChannelPager;
  }
  class PlaylistPager {
    constructor(results: PlatformPlaylist[], hasMore?: boolean, context?: PagerContext);
    plugin_type: "PlaylistPager";
    results: PlatformPlaylist[];
    hasMore: boolean;
    context: PagerContext;
    hasMorePagers(): boolean;
    nextPage(): PlaylistPager;
  }
  class CommentPager {
    constructor(results: PlatformComment[], hasMore?: boolean, context?: PagerContext);
    plugin_type: "CommentPager";
    results: PlatformComment[];
    hasMore: boolean;
    context: PagerContext;
    hasMorePagers(): boolean;
    nextPage(): CommentPager;
  }
}

export {};
