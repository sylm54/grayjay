/**
 * Shared types describing the Grayjay plugin runtime contract.
 *
 * These types mirror the Android engine (`V8Plugin.kt`, `JSClient.kt`,
 * `app/src/main/assets/scripts/source.js`) and the desktop Grayjay.Engine.
 * They are consumed two ways:
 *
 *  - `globals.d.ts` re-exposes them as ambient globals (`source`, `http`,
 *    `PlatformVideo`, …) so plugin code is fully typed with zero imports and
 *    zero runtime overhead.
 *  - `@grayjay/tester` and tooling import them directly.
 *
 * Field-by-field defaults follow the engine's `source.js` polyfill; where the
 * engine applies `obj.field ?? default`, the field is optional here.
 */

/** Unix timestamp in seconds (what the engine calls `datetime` / `uploadDate`). */
export type UnixTimestamp = number;

/** Byte arrays cross the bridge as typed arrays. */
export type ByteArray = Uint8Array;

/* ============================================================================
 * Enum-like constants (`Type` / `Language` globals)
 * ========================================================================== */

export const Type = {
  Source: {
    Dash: "DASH",
    HLS: "HLS",
    STATIC: "Static",
  },
  Feed: {
    Videos: "VIDEOS",
    Streams: "STREAMS",
    Mixed: "MIXED",
    Live: "LIVE",
    Subscriptions: "SUBSCRIPTIONS",
    Shorts: "SHORTS",
  },
  Order: {
    Chronological: "CHRONOLOGICAL",
  },
  Date: {
    LastHour: "LAST_HOUR",
    Today: "TODAY",
    LastWeek: "LAST_WEEK",
    LastMonth: "LAST_MONTH",
    LastYear: "LAST_YEAR",
  },
  Duration: {
    Short: "SHORT",
    Medium: "MEDIUM",
    Long: "LONG",
  },
  Text: {
    RAW: 0,
    HTML: 1,
    MARKUP: 2,
    CODE: 3,
  },
  Chapter: {
    NORMAL: 0,
    SKIPPABLE: 5,
    SKIP: 6,
    SKIPONCE: 7,
  },
} as const;

export type Type = typeof Type;

export type FeedType = (typeof Type.Feed)[keyof typeof Type.Feed];
export type TextType = (typeof Type.Text)[keyof typeof Type.Text];
export type ChapterTypeValue = (typeof Type.Chapter)[keyof typeof Type.Chapter];

export const Language = {
  UNKNOWN: "Unknown",
  ARABIC: "ar",
  SPANISH: "es",
  FRENCH: "fr",
  HINDI: "hi",
  INDONESIAN: "id",
  KOREAN: "ko",
  PORTUGUESE: "pt",
  PORTBRAZIL: "pt",
  RUSSIAN: "ru",
  THAI: "th",
  TURKISH: "tr",
  VIETNAMESE: "vi",
  ENGLISH: "en",
} as const;

export type Language = typeof Language;

/* ============================================================================
 * Identity, thumbnails, authors
 * ========================================================================== */

export interface PlatformID {
  /** Platform name, e.g. `"YouTube"`. Usually your plugin's platform constant. */
  platform: string;
  /** Unique id of the item on the platform. */
  value: string;
  /** Your plugin's config id. Pass `plugin.config.id`. */
  pluginId?: string;
  /** Polycentric claim type (0 = none). */
  claimType?: number;
  /** Polycentric claim field type (-1 = none). */
  claimFieldType?: number;
}

export interface Thumbnail {
  url: string;
  /** Height in pixels (e.g. 720). */
  quality: number;
}

export interface Thumbnails {
  sources: Thumbnail[];
}

export interface PlatformAuthorLink {
  id: PlatformID;
  name: string;
  url: string;
  thumbnail?: string;
  /** Optional subscriber count shown on channels. */
  subscribers?: number;
  /** Optional membership link (e.g. join page). */
  membershipUrl?: string | null;
}

/* ============================================================================
 * Search capabilities
 * ========================================================================== */

export interface FilterCapability {
  /** Stable filter id; `Type.Date.Today` etc. unlock app-side behavior. */
  id?: string;
  /** User-visible name. */
  name: string;
  /** Value your plugin receives back in `filters[id]`. */
  value: string;
}

export interface FilterGroup {
  id?: string;
  name: string;
  isMultiSelect?: boolean;
  filters: FilterCapability[];
}

/** Shape returned by `getSearchCapabilities` and friends (plain object). */
export interface SearchCapabilities {
  /** Feed types the endpoint can return. */
  types: FeedType[];
  /** Sort orders; `"^release_time"` gets special chronological handling. */
  sorts?: string[];
  filters?: FilterGroup[];
}

/* ============================================================================
 * Request modifiers (attached to media sources)
 * ========================================================================== */

export interface RequestHeadersModifier {
  headers: Record<string, string>;
}

export interface RequestModifier {
  /** Deprecated engine flag, kept for parity. */
  allowByteSkip?: boolean;
  /** Rewrite outgoing requests for this source. */
  modifyRequest?(url: string, headers: Record<string, string>): { url: string; headers: Record<string, string> };
}

export type SourceRequestModifier = RequestModifier | RequestHeadersModifier;

/* ============================================================================
 * Media sources
 * ========================================================================== */

export interface VideoUrlSourceInit {
  width?: number;
  height?: number;
  container?: string;
  codec?: string;
  name?: string;
  bitrate?: number;
  duration?: number;
  url: string;
  language?: string;
  original?: boolean;
  requestModifier?: SourceRequestModifier;
}

export interface VideoUrlRangeSourceInit extends VideoUrlSourceInit {
  itagId?: number | null;
  initStart?: number | null;
  initEnd?: number | null;
  indexStart?: number | null;
  indexEnd?: number | null;
}

export interface WidevineFields {
  licenseUri: string;
  getLicenseRequestExecutor?: () => LicenseRequestExecutor;
}

export interface LicenseRequestExecutor {
  executeRequest(url: string, headers: Record<string, string>, method: string, licenseRequestData: string): string;
}

export interface VideoUrlWidevineSourceInit extends VideoUrlSourceInit, WidevineFields {}

export interface AudioUrlWidevineSourceInit extends AudioUrlSourceInit, WidevineFields {
  /** @deprecated Use getLicenseRequestExecutor instead. */
  bearerToken?: string;
}

export interface AudioUrlSourceInit {
  name?: string;
  bitrate?: number;
  container?: string;
  codec?: string;
  duration?: number;
  url: string;
  language?: string;
  requestModifier?: SourceRequestModifier;
}

export interface AudioUrlRangeSourceInit extends AudioUrlSourceInit {
  itagId?: number | null;
  initStart?: number | null;
  initEnd?: number | null;
  indexStart?: number | null;
  indexEnd?: number | null;
  audioChannels?: number;
}

export interface HLSSourceInit {
  name?: string;
  duration?: number;
  url: string;
  /** Set `true` to prioritize HLS over progressive sources. */
  priority?: boolean;
  language?: string;
  original?: boolean;
  requestModifier?: SourceRequestModifier;
}

export interface DashSourceInit {
  name?: string;
  duration?: number;
  url: string;
  language?: string;
  original?: boolean;
  requestModifier?: SourceRequestModifier;
}

export interface DashManifestRawSourceInit {
  name?: string;
  bitrate?: number;
  container?: string;
  codec?: string;
  duration?: number;
  url: string;
  language?: string;
  original?: boolean;
  requestModifier?: SourceRequestModifier;
}

export interface DashManifestRawAudioSourceInit extends DashManifestRawSourceInit {
  /** Pre-fetched manifest body, if you already have it. */
  manifest?: string | null;
}

export interface UMPSourceInit {
  name?: string;
  url: string;
  ustreamerConfig?: string;
  videoId?: string;
  isLive?: boolean;
  duration?: number;
  width?: number;
  height?: number;
  priority?: boolean;
  language?: string;
  original?: boolean;
  clientName?: number;
  clientVersion?: string;
  osName?: string;
  osVersion?: string;
  videoFormats?: string[];
  audioFormats?: string[];
  poToken?: string;
  getPoToken?: () => string;
  requestModifier?: SourceRequestModifier;
}

export interface VideoSourceDescriptor {
  isUnMuxed: false;
  videoSources: VideoUrlSource[];
}

export interface UnMuxVideoSourceDescriptor {
  isUnMuxed: true;
  videoSources: VideoUrlSource[];
  audioSources: AudioUrlSource[];
}

export type AnyVideoSource = VideoUrlSource | HLSSource | DashSource;
export type AnyAudioSource = AudioUrlSource;

/* ============================================================================
 * Content types (feed + details)
 * ========================================================================== */

interface PlatformContentBaseInit {
  id?: PlatformID;
  name?: string;
  /** Prefer a `Thumbnails` instance; a plain `Thumbnail[]` is stored as-is. */
  thumbnails?: Thumbnails | Thumbnail[];
  author?: PlatformAuthorLink;
  /** Unix seconds. `uploadDate` is accepted as an alias (engine parity). */
  datetime?: UnixTimestamp;
  uploadDate?: UnixTimestamp;
  url?: string;
}

export interface PlatformNestedMediaContentInit extends PlatformContentBaseInit {
  /** Url of the nested item, handled by another plugin or the browser. */
  contentUrl: string;
  contentName?: string;
  contentDescription?: string;
  contentProvider?: string;
  contentThumbnails?: Thumbnails;
}

export interface PlatformLockedContentInit extends PlatformContentBaseInit {
  contentName?: string;
  contentThumbnails?: Thumbnails;
  unlockUrl?: string;
  lockDescription?: string;
}

export interface PlatformVideoInit extends PlatformContentBaseInit {
  shareUrl?: string;
  /** Duration in seconds; -1 = unknown. */
  duration?: number;
  /** -1 = unknown. */
  viewCount?: number;
  playbackTime?: number;
  playbackDate?: number;
  isLive?: boolean;
  isShort?: boolean;
}

export interface RatingLikes {
  type: 1;
  likes: number;
}

export interface RatingLikesDislikes {
  type: 2;
  likes: number;
  dislikes: number;
}

export interface RatingScaler {
  type: 3;
  value: number;
}

export type Rating = RatingLikes | RatingLikesDislikes | RatingScaler;

export interface Subtitle {
  name: string;
  url?: string;
  /** e.g. `"text/vtt"`. */
  format?: string;
  language?: string;
  /** Optional fetcher used instead of downloading `url`. */
  getSubtitles?(): string;
}

export interface PlatformVideoDetailsInit extends PlatformVideoInit {
  description?: string;
  video?: VideoSourceDescriptor | UnMuxVideoSourceDescriptor;
  /** @deprecated Engine keeps for backcompat; set `video`/`live` instead. */
  dash?: DashSource | null;
  /** @deprecated Engine keeps for backcompat. */
  hls?: HLSSource | null;
  /** Live source override when `isLive` is true. */
  live?: HLSSource | DashSource | VideoUrlSource | null;
  rating?: Rating | null;
  subtitles?: Subtitle[];
  isShort?: boolean;
  /** Optional direct recommendations pager for this detail object. */
  getContentRecommendations?(url: string, initialData?: unknown): ContentPager | VideoPager | null;
}

export interface PlatformPostInit extends PlatformContentBaseInit {
  description?: string;
  images?: string[];
}

export interface PlatformPostDetailsInit extends PlatformPostInit {
  rating?: Rating;
  textType?: TextType;
  content?: string;
}

export interface PlatformArticleInit extends PlatformContentBaseInit {
  summary?: string;
  rating?: Rating;
}

export interface ArticleTextSegment {
  type: 1;
  content: string;
  textType?: TextType;
}

export interface ArticleImagesSegment {
  type: 2;
  images: string[];
  caption?: string;
}

export interface ArticleHeaderSegment {
  type: 3;
  level: number;
  content: string;
}

export interface ArticleNestedSegment {
  type: 9;
  nested: ArticleSegment[];
}

export type ArticleSegment = ArticleTextSegment | ArticleImagesSegment | ArticleHeaderSegment | ArticleNestedSegment;

export interface PlatformArticleDetailsInit extends PlatformArticleInit {
  segments?: ArticleSegment[];
}

export interface PlatformWebInit extends PlatformContentBaseInit {}

export interface PlatformWebDetailsInit extends PlatformWebInit {
  html: string;
}

export interface PlatformChannelInit {
  /** Official plugins pass a PlatformID instance; a plain string also works on Android. */
  id?: string | PlatformID;
  name?: string;
  thumbnail?: string;
  banner?: string;
  subscribers?: number;
  description?: string;
  url?: string;
  /** Alternative urls that also resolve to this channel. */
  urlAlternatives?: string[];
  /** e.g. `{ "Twitter": "https://twitter.com/handle" }`. */
  links?: Record<string, string>;
}

export interface PlatformPlaylistInit extends PlatformContentBaseInit {
  videoCount?: number;
  thumbnail?: string;
}

export interface PlatformPlaylistDetailsInit extends PlatformPlaylistInit {
  /** A pager over the playlist's videos. */
  contents: VideoPager;
}

export interface PlatformCommentInit {
  contextUrl?: string;
  author?: PlatformAuthorLink;
  message?: string;
  rating?: Rating;
  /** Unix seconds. */
  date?: UnixTimestamp;
  replyCount?: number;
  /** Arbitrary data you get back in `getSubComments`. */
  context?: Record<string, unknown>;
  /** Optional direct replies pager, bypassing `getSubComments`. */
  getReplies?(): CommentPager;
}

export interface VideoChapter {
  name: string;
  timeStart: number;
  timeEnd: number;
  type?: ChapterTypeValue;
}

export interface LiveChatWindowDescriptor {
  url: string;
  /** CSS selectors of elements to remove from the embedded chat window. */
  removeElements?: string[];
  removeElementsInterval?: string[];
}

/* ============================================================================
 * Live events
 * ========================================================================== */

export interface LiveEventComment {
  type: 1;
  name: string;
  message: string;
  thumbnail?: string;
  colorName?: string | number;
  badges?: unknown[];
}

export interface LiveEventEmojis {
  type: 4;
  emojis: string[];
}

export interface LiveEventDonation {
  type: 5;
  amount: string;
  name: string;
  message?: string;
  thumbnail?: string;
  expire?: number;
  colorDonation?: string | number;
}

export interface LiveEventViewCount {
  type: 10;
  viewCount: number;
}

export interface LiveEventRaid {
  type: 100;
  targetUrl: string;
  targetName: string;
  targetThumbnail?: string;
  isOutgoing?: boolean;
}

export type LiveEvent = LiveEventComment | LiveEventEmojis | LiveEventDonation | LiveEventViewCount | LiveEventRaid;

/* ============================================================================
 * Playback tracking
 * ========================================================================== */

export interface PlaybackTracker {
  /** Milliseconds between `setProgress` calls. Default 10000. */
  nextRequest: number;
  setProgress(seconds: number): void;
}

/* ============================================================================
 * Pagers
 * ========================================================================== */

export interface PagerContext {
  [key: string]: unknown;
}

interface PagerBase<TItem, TContext extends PagerContext> {
  results: TItem[];
  hasMore: boolean;
  context: TContext;
  hasMorePagers(): boolean;
  /**
   * Fetch the next page. Mutate `this.results`/`this.hasMore` and return
   * `undefined`/`this` (recommended), or return a fresh pager that replaces
   * this one.
   */
  nextPage?(): PagerBase<TItem, TContext> | void;
}

export type FeedItem =
  | PlatformVideo
  | PlatformVideoDetails
  | PlatformPost
  | PlatformNestedMediaContent
  | PlatformLockedContent
  | PlatformPlaylist
  | PlatformArticle
  | PlatformWeb;

export interface ContentPager<TContext extends PagerContext = PagerContext> extends PagerBase<FeedItem, TContext> {}
export interface VideoPager<TContext extends PagerContext = PagerContext> extends PagerBase<PlatformVideo | PlatformVideoDetails, TContext> {}
export interface ChannelPager<TContext extends PagerContext = PagerContext> extends PagerBase<PlatformChannel, TContext> {}
export interface PlaylistPager<TContext extends PagerContext = PagerContext> extends PagerBase<PlatformPlaylist, TContext> {}
export interface CommentPager<TContext extends PagerContext = PagerContext> extends PagerBase<PlatformComment, TContext> {}
export interface LiveEventPager<TContext extends PagerContext = PagerContext> extends PagerBase<LiveEvent, TContext> {
  /** Poll interval hint in ms. Default 4000. */
  nextRequest?: number;
}

/* ============================================================================
 * Concrete content shapes (what engine classes produce)
 * ========================================================================== */

export interface PlatformContent extends PlatformContentBaseInit {
  contentType: number;
  thumbnails?: Thumbnails | Thumbnail[];
}

export interface PlatformNestedMediaContent extends PlatformNestedMediaContentInit, PlatformContent {}
export interface PlatformLockedContent extends PlatformLockedContentInit, PlatformContent {}
export interface PlatformVideo extends PlatformVideoInit, PlatformContent {
  plugin_type: "PlatformVideo";
}
export interface PlatformVideoDetails extends PlatformVideoDetailsInit, PlatformVideoInit {
  plugin_type: "PlatformVideoDetails";
}
export interface PlatformPost extends PlatformPostInit, PlatformContent {
  plugin_type: "PlatformPost";
}
export interface PlatformPostDetails extends PlatformPostDetailsInit, PlatformPostInit {
  plugin_type: "PlatformPostDetails";
}
export interface PlatformWeb extends PlatformWebInit, PlatformContent {
  plugin_type: "PlatformWeb";
}
export interface PlatformWebDetails extends PlatformWebDetailsInit, PlatformWebInit {
  plugin_type: "PlatformWebDetails";
}
export interface PlatformArticle extends PlatformArticleInit, PlatformContent {
  plugin_type: "PlatformArticle";
}
export interface PlatformArticleDetails extends PlatformArticleDetailsInit, PlatformArticleInit {
  plugin_type: "PlatformArticleDetails";
}
export interface PlatformChannel extends PlatformChannelInit {
  plugin_type: "PlatformChannel";
}
export interface PlatformPlaylist extends PlatformPlaylistInit, PlatformContent {
  plugin_type: "PlatformPlaylist";
}
export interface PlatformPlaylistDetails extends PlatformPlaylistDetailsInit, PlatformPlaylistInit {
  plugin_type: "PlatformPlaylistDetails";
}
export interface PlatformComment extends PlatformCommentInit {
  plugin_type: "Comment";
}

export interface VideoUrlSource extends VideoUrlSourceInit {
  plugin_type: "VideoUrlSource" | "VideoUrlRangeSource" | "VideoUrlWidevineSource";
}
export interface VideoUrlRangeSource extends VideoUrlRangeSourceInit {
  plugin_type: "VideoUrlRangeSource";
}
export interface VideoUrlWidevineSource extends VideoUrlSourceInit, WidevineFields {
  plugin_type: "VideoUrlWidevineSource";
}
export interface AudioUrlSource extends AudioUrlSourceInit {
  plugin_type: "AudioUrlSource" | "AudioUrlRangeSource" | "AudioUrlWidevineSource";
}
export interface AudioUrlRangeSource extends AudioUrlRangeSourceInit {
  plugin_type: "AudioUrlRangeSource";
}
export interface AudioUrlWidevineSource extends AudioUrlSourceInit, WidevineFields {
  plugin_type: "AudioUrlWidevineSource";
}
export interface HLSSource extends HLSSourceInit {
  plugin_type: "HLSSource";
}
export interface DashSource extends DashSourceInit {
  plugin_type: "DashSource" | "DashWidevineSource";
}
export interface DashWidevineSource extends DashSourceInit, WidevineFields {
  plugin_type: "DashWidevineSource";
}
export interface DashManifestRawSource extends DashManifestRawSourceInit {
  plugin_type: "DashRawSource";
}
export interface DashManifestRawAudioSource extends DashManifestRawAudioSourceInit {
  plugin_type: "DashRawAudioSource";
}
export interface UMPSource extends UMPSourceInit {
  plugin_type: "UMPSource";
}

export type ContentDetails =
  | PlatformVideoDetails
  | PlatformPostDetails
  | PlatformArticleDetails
  | PlatformWebDetails
  | PlatformPlaylistDetails;

/* ============================================================================
 * `source` — the plugin interface (signatures match JSClient.kt call sites)
 * ========================================================================== */

/** Filters argument: plain object of selected filter values. */
export type SearchFilters = Record<string, string[]> | null;

/** Runtime config object passed to `source.enable`. */
export interface SourcePluginRuntimeConfig {
  name: string;
  description?: string;
  author?: string;
  authorUrl?: string;
  version: number;
  id: string;
  iconUrl?: string | null;
  sourceUrl?: string | null;
  constants?: Record<string, string>;
  [key: string]: unknown;
}

/** Settings object passed to `source.enable` (string values are JSON-parsed). */
export type PluginSettings = Record<string, string | number | boolean | null>;

export interface Source {
  /* -- lifecycle ---------------------------------------------------------- */

  /** Called when the plugin is enabled/started. */
  enable?(config: SourcePluginRuntimeConfig, settings: PluginSettings, savedState: string | null): void;
  /** Called before the plugin is disabled/stopped. */
  disable?(): void;
  /** Return a serialized state string; it is passed back to `enable`. */
  saveState?(): string;

  /* -- feeds --------------------------------------------------------------- */

  /** Home feed. */
  getHome(): VideoPager | ContentPager;
  /** Shorts feed. Detected as available when this method exists. */
  getShorts?(): VideoPager | ContentPager;

  /* -- search --------------------------------------------------------------- */

  searchSuggestions?(query: string): string[];
  getSearchCapabilities?(): SearchCapabilities;
  search?(query: string, type: FeedType | null, order: string | null, filters: SearchFilters): VideoPager | ContentPager;
  getSearchChannelContentsCapabilities?(): SearchCapabilities;
  searchChannelContents?(
    channelUrl: string,
    query: string,
    type: FeedType | null,
    order: string | null,
    filters: SearchFilters,
  ): VideoPager | ContentPager;
  searchChannels?(query: string): ChannelPager;
  searchPlaylists?(query: string, type: FeedType | null, order: string | null, filters: SearchFilters): ContentPager;

  /* -- channels -------------------------------------------------------------- */

  isChannelUrl?(url: string): boolean;
  getChannel?(url: string): PlatformChannel;
  getChannelCapabilities?(): SearchCapabilities;
  getChannelContents?(
    url: string,
    type: FeedType | null,
    order: string | null,
    filters: SearchFilters,
  ): VideoPager | ContentPager;
  getChannelPlaylists?(url: string): PlaylistPager | ContentPager;
  /** Feed types `peekChannelContents` can return quickly. */
  getPeekChannelTypes?(): FeedType[];
  /** Small, fast batch of a channel's latest items (plain array, no pager). */
  peekChannelContents?(url: string, type: FeedType): FeedItem[];
  /** Polycentric claim → channel url. */
  getChannelUrlByClaim?(claimType: number, claimValues: string[]): string | null;
  /** Polycentric claim template map. */
  getChannelTemplateByClaimMap?(): Record<string, Record<string, string>>;

  /* -- content ---------------------------------------------------------------- */

  isContentDetailsUrl?(url: string): boolean;
  getContentDetails?(url: string): ContentDetails;
  getContentChapters?(url: string): VideoChapter[];
  getPlaybackTracker?(url: string): PlaybackTracker | null;
  getComments?(url: string): CommentPager;
  /** Receives the serialized comment (parse if given a string). */
  getSubComments?(comment: PlatformComment | string): CommentPager;
  getLiveChatWindow?(url: string): LiveChatWindowDescriptor | null;
  getLiveEvents?(url: string): LiveEventPager | null;
  getContentRecommendations?(url: string): ContentPager | VideoPager | null;

  /* -- playlists ---------------------------------------------------------------- */

  isPlaylistUrl?(url: string): boolean;
  getPlaylist?(url: string): PlatformPlaylistDetails;

  /* -- user (requires login) ------------------------------------------------------ */

  getUserSubscriptions?(): string[];
  getUserPlaylists?(): PlatformPlaylist[];
  getUserHistory?(): ContentPager;
}

/**
 * Object accepted by `definePlugin` — every `source` method, all optional so
 * you implement what your platform supports. Excess properties are rejected,
 * so typos fail at compile time.
 */
export type PluginDefinition = { [K in keyof Source]?: Source[K] };
