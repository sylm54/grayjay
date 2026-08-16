/**
 * Clean-room reimplementation of the engine's `source.js` polyfill.
 *
 * The Grayjay app injects these classes as globals before your plugin script
 * runs. This module reimplements the same contract (same names, same
 * `plugin_type` discriminators, same `??` defaults) so `@grayjay/tester` can
 * execute plugins outside the app with faithful behavior.
 *
 * Plugin bundles must NOT import this — the engine already provides these
 * globals at runtime.
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
  SourcePluginRuntimeConfig,
  SourceRequestModifier,
  Subtitle,
  TextType,
  UMPSourceInit,
  UnixTimestamp,
  VideoUrlRangeSourceInit,
  VideoUrlSourceInit,
  VideoUrlWidevineSourceInit,
  PlatformID as PlatformIDShape,
} from "./types.js";

export { Type, Language } from "./types.js";
import { Type, Language } from "./types.js";

type AnyInit = Record<string, any>;

/* ============================================================================
 * Identity, thumbnails, authors, ratings
 * ========================================================================== */

export class PlatformID {
  platform: string;
  pluginId?: string;
  value: string;
  claimType: number;
  claimFieldType: number;

  constructor(platform?: string, id?: string, pluginId?: string, claimType?: number, claimFieldType?: number) {
    this.platform = platform ?? "";
    this.pluginId = pluginId;
    this.value = id ?? ("" as string);
    this.claimType = claimType ?? 0;
    this.claimFieldType = claimFieldType ?? -1;
  }
}

export class Thumbnail {
  url: string;
  quality: number;
  constructor(url?: string, quality?: number) {
    this.url = url ?? "";
    this.quality = quality ?? 0;
  }
}

export class Thumbnails {
  sources: Thumbnail[];
  constructor(thumbnails?: Thumbnail[]) {
    this.sources = thumbnails ?? [];
  }
}

export class PlatformAuthorLink {
  id: PlatformID;
  name: string;
  url: string;
  thumbnail?: string;
  subscribers?: number;
  membershipUrl?: string | null;

  constructor(
    id?: PlatformID,
    name?: string,
    url?: string,
    thumbnail?: string,
    subscribers?: number,
    membershipUrl?: string,
  ) {
    this.id = id ?? new PlatformID();
    this.name = name ?? "";
    this.url = url ?? "";
    this.thumbnail = thumbnail;
    if (subscribers !== undefined) this.subscribers = subscribers;
    if (membershipUrl !== undefined) this.membershipUrl = membershipUrl ?? null;
  }
}

export class RatingLikes {
  type: 1 = 1;
  likes: number;
  constructor(likes: number) {
    this.likes = likes;
  }
}
export class RatingLikesDislikes {
  type: 2 = 2;
  likes: number;
  dislikes: number;
  constructor(likes: number, dislikes: number) {
    this.likes = likes;
    this.dislikes = dislikes;
  }
}
export class RatingScaler {
  type: 3 = 3;
  value: number;
  constructor(value: number) {
    this.value = value;
  }
}

/* ============================================================================
 * Exceptions (engine recognizes these via `plugin_type`)
 * ========================================================================== */

export class ScriptException extends Error {
  plugin_type: string;
  msg: string;
  constructor(typeOrMessage: string, msg?: string) {
    if (arguments.length === 1) {
      super(typeOrMessage);
      this.plugin_type = "ScriptException";
      this.message = typeOrMessage;
      this.msg = typeOrMessage;
    } else {
      super(msg);
      this.plugin_type = typeOrMessage ?? "";
      this.msg = msg ?? "";
    }
  }
}
export class ScriptLoginRequiredException extends ScriptException {
  constructor(msg: string) {
    super("ScriptLoginRequiredException", msg);
  }
}
export class LoginRequiredException extends ScriptException {
  constructor(msg: string) {
    super("ScriptLoginRequiredException", msg);
  }
}
export class CaptchaRequiredException extends Error {
  plugin_type: "CaptchaRequiredException" = "CaptchaRequiredException";
  url: string;
  body: string;
  constructor(url: string, body?: string) {
    super(JSON.stringify({ plugin_type: "CaptchaRequiredException", url, body }));
    this.url = url;
    this.body = body ?? "";
  }
}
export class CriticalException extends ScriptException {
  constructor(msg: string) {
    super("CriticalException", msg);
  }
}
export class UnavailableException extends ScriptException {
  constructor(msg: string) {
    super("UnavailableException", msg);
  }
}
export class ReloadRequiredException extends ScriptException {
  reloadData: unknown;
  constructor(msg: string, reloadData?: unknown) {
    super("ReloadRequiredException", msg);
    this.reloadData = reloadData;
  }
}
export class AgeException extends ScriptException {
  constructor(msg: string) {
    super("AgeException", msg);
  }
}
export class TimeoutException extends ScriptException {
  constructor(msg: string) {
    super(msg);
    this.plugin_type = "ScriptTimeoutException";
  }
}
export class ScriptImplementationException extends ScriptException {
  constructor(msg: string) {
    super(msg);
    this.plugin_type = "ScriptImplementationException";
  }
}

/* ============================================================================
 * Media sources
 * ========================================================================== */

export class RequestModifier {
  allowByteSkip?: boolean;
  constructor(obj: AnyInit = {}) {
    this.allowByteSkip = obj.allowByteSkip;
  }
}

export class VideoUrlSource {
  plugin_type: "VideoUrlSource" | "VideoUrlWidevineSource" | "VideoUrlRangeSource" = "VideoUrlSource";
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

  constructor(obj: VideoUrlSourceInit = {} as VideoUrlSourceInit) {
    this.width = obj.width ?? 0;
    this.height = obj.height ?? 0;
    this.container = obj.container ?? "";
    this.codec = obj.codec ?? "";
    this.name = obj.name ?? "";
    this.bitrate = obj.bitrate ?? 0;
    this.duration = obj.duration ?? 0;
    this.url = (obj as AnyInit).url;
    this.language = obj.language;
    this.original = obj.original;
    if (obj.requestModifier) this.requestModifier = obj.requestModifier;
  }
}

export class VideoUrlWidevineSource extends VideoUrlSource {
  override plugin_type: "VideoUrlWidevineSource" = "VideoUrlWidevineSource";
  licenseUri: string;
  constructor(obj: VideoUrlWidevineSourceInit = {} as VideoUrlWidevineSourceInit) {
    super(obj as VideoUrlSourceInit);
    this.licenseUri = (obj as AnyInit).licenseUri;
  }
}

export class VideoUrlRangeSource extends VideoUrlSource {
  override plugin_type: "VideoUrlRangeSource" = "VideoUrlRangeSource";
  itagId: number | null;
  initStart: number | null;
  initEnd: number | null;
  indexStart: number | null;
  indexEnd: number | null;

  constructor(obj: VideoUrlRangeSourceInit = {} as VideoUrlRangeSourceInit) {
    super(obj as VideoUrlSourceInit);
    this.itagId = obj.itagId ?? null;
    this.initStart = obj.initStart ?? null;
    this.initEnd = obj.initEnd ?? null;
    this.indexStart = obj.indexStart ?? null;
    this.indexEnd = obj.indexEnd ?? null;
  }
}

export class AudioUrlSource {
  plugin_type: "AudioUrlSource" | "AudioUrlWidevineSource" | "AudioUrlRangeSource" = "AudioUrlSource";
  name: string;
  bitrate: number;
  container: string;
  codec: string;
  duration: number;
  url: string;
  language: string;
  requestModifier?: SourceRequestModifier;

  constructor(obj: AudioUrlSourceInit = {} as AudioUrlSourceInit) {
    this.name = obj.name ?? "";
    this.bitrate = obj.bitrate ?? 0;
    this.container = obj.container ?? "";
    this.codec = obj.codec ?? "";
    this.duration = obj.duration ?? 0;
    this.url = (obj as AnyInit).url;
    this.language = obj.language ?? Language.UNKNOWN;
    if (obj.requestModifier) this.requestModifier = obj.requestModifier;
  }
}

export class AudioUrlWidevineSource extends AudioUrlSource {
  override plugin_type: "AudioUrlWidevineSource" = "AudioUrlWidevineSource";
  licenseUri: string;
  constructor(obj: AudioUrlWidevineSourceInit = {} as AudioUrlWidevineSourceInit) {
    super(obj as AudioUrlSourceInit);
    this.licenseUri = (obj as AnyInit).licenseUri;
  }
}

export class AudioUrlRangeSource extends AudioUrlSource {
  override plugin_type: "AudioUrlRangeSource" = "AudioUrlRangeSource";
  itagId: number | null;
  initStart: number | null;
  initEnd: number | null;
  indexStart: number | null;
  indexEnd: number | null;
  audioChannels: number;

  constructor(obj: AudioUrlRangeSourceInit = {} as AudioUrlRangeSourceInit) {
    super(obj as AudioUrlSourceInit);
    this.itagId = obj.itagId ?? null;
    this.initStart = obj.initStart ?? null;
    this.initEnd = obj.initEnd ?? null;
    this.indexStart = obj.indexStart ?? null;
    this.indexEnd = obj.indexEnd ?? null;
    this.audioChannels = obj.audioChannels ?? 2;
  }
}

export class HLSSource {
  plugin_type: "HLSSource" = "HLSSource";
  name: string;
  duration: number;
  url: string;
  priority: boolean;
  language?: string;
  original?: boolean;
  requestModifier?: SourceRequestModifier;

  constructor(obj: HLSSourceInit = {} as HLSSourceInit) {
    this.name = obj.name ?? "HLS";
    this.duration = obj.duration ?? 0;
    this.url = (obj as AnyInit).url;
    this.priority = obj.priority ?? false;
    this.language = obj.language;
    this.original = obj.original;
    if (obj.requestModifier) this.requestModifier = obj.requestModifier;
  }
}

export class DashSource {
  plugin_type: "DashSource" | "DashWidevineSource" = "DashSource";
  name: string;
  duration: number;
  url: string;
  language?: string;
  original?: boolean;
  requestModifier?: SourceRequestModifier;

  constructor(obj: DashSourceInit = {} as DashSourceInit) {
    this.name = obj.name ?? "Dash";
    this.duration = obj.duration ?? 0;
    this.url = (obj as AnyInit).url;
    this.language = obj.language;
    this.original = obj.original;
    if (obj.requestModifier) this.requestModifier = obj.requestModifier;
  }
}

export class DashWidevineSource extends DashSource {
  override plugin_type: "DashWidevineSource" = "DashWidevineSource";
  licenseUri: string;
  constructor(obj: DashSourceInit & { licenseUri: string } = {} as any) {
    super(obj);
    this.licenseUri = obj.licenseUri;
  }
}

export class DashManifestRawSource {
  plugin_type: "DashRawSource" = "DashRawSource";
  name: string;
  bitrate: number;
  container: string;
  codec: string;
  duration: number;
  url: string;
  language: string;
  original?: boolean;
  requestModifier?: SourceRequestModifier;

  constructor(obj: DashManifestRawSourceInit = {} as DashManifestRawSourceInit) {
    this.name = obj.name ?? "";
    this.bitrate = obj.bitrate ?? 0;
    this.container = obj.container ?? "";
    this.codec = obj.codec ?? "";
    this.duration = obj.duration ?? 0;
    this.url = (obj as AnyInit).url;
    this.language = obj.language ?? Language.UNKNOWN;
    this.original = obj.original;
    if (obj.requestModifier) this.requestModifier = obj.requestModifier;
  }
}

export class DashManifestRawAudioSource {
  plugin_type: "DashRawAudioSource" = "DashRawAudioSource";
  name: string;
  bitrate: number;
  container: string;
  codec: string;
  duration: number;
  url: string;
  language: string;
  manifest: string | null;
  requestModifier?: SourceRequestModifier;

  constructor(obj: DashManifestRawAudioSourceInit = {} as DashManifestRawAudioSourceInit) {
    this.name = obj.name ?? "";
    this.bitrate = obj.bitrate ?? 0;
    this.container = obj.container ?? "";
    this.codec = obj.codec ?? "";
    this.duration = obj.duration ?? 0;
    this.url = (obj as AnyInit).url;
    this.language = obj.language ?? Language.UNKNOWN;
    this.manifest = obj.manifest ?? null;
    if (obj.requestModifier) this.requestModifier = obj.requestModifier;
  }
}

export class UMPSource {
  plugin_type: "UMPSource" = "UMPSource";
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

  constructor(obj: UMPSourceInit = {} as UMPSourceInit) {
    this.name = obj.name ?? "UMP";
    this.url = (obj as AnyInit).url;
    this.ustreamerConfig = obj.ustreamerConfig;
    this.videoId = obj.videoId ?? "";
    this.isLive = obj.isLive ?? false;
    this.duration = obj.duration ?? 0;
    this.width = obj.width ?? 0;
    this.height = obj.height ?? 0;
    this.priority = obj.priority ?? false;
    this.language = obj.language;
    this.original = obj.original;
    this.clientName = obj.clientName ?? 1;
    this.clientVersion = obj.clientVersion ?? "2.20250923.08.00";
    this.osName = obj.osName ?? "Windows";
    this.osVersion = obj.osVersion ?? "10.0";
    this.videoFormats = obj.videoFormats ?? [];
    this.audioFormats = obj.audioFormats ?? [];
    this.poToken = obj.poToken;
    if ((obj as AnyInit).getPoToken) (this as AnyInit).getPoToken = obj.getPoToken;
    if (obj.requestModifier) this.requestModifier = obj.requestModifier;
  }
}

export class VideoSourceDescriptor {
  plugin_type: "MuxVideoSourceDescriptor" = "MuxVideoSourceDescriptor";
  isUnMuxed: false = false;
  videoSources: VideoUrlSource[];

  constructor(obj: VideoUrlSource[] | { videoSources?: VideoUrlSource[] } = []) {
    if (Array.isArray(obj)) this.videoSources = obj;
    else this.videoSources = (obj as AnyInit).videoSources ?? [];
  }
}

export class UnMuxVideoSourceDescriptor {
  plugin_type: "UnMuxVideoSourceDescriptor" = "UnMuxVideoSourceDescriptor";
  isUnMuxed: true = true;
  videoSources: VideoUrlSource[];
  audioSources: AudioUrlSource[];

  constructor(
    videoSourcesOrObj: VideoUrlSource[] | { videoSources?: VideoUrlSource[]; audioSources?: AudioUrlSource[] } = {},
    audioSources?: AudioUrlSource[],
  ) {
    if (Array.isArray(videoSourcesOrObj)) {
      this.videoSources = videoSourcesOrObj;
      this.audioSources = audioSources ?? [];
    } else {
      this.videoSources = (videoSourcesOrObj as AnyInit).videoSources ?? [];
      this.audioSources = (videoSourcesOrObj as AnyInit).audioSources ?? [];
    }
  }
}

/* ============================================================================
 * Content
 * ========================================================================== */

export class PlatformContent {
  contentType: number;
  id: PlatformID;
  name: string;
  thumbnails: Thumbnails | Thumbnail[];
  author?: PlatformAuthorLink;
  datetime: UnixTimestamp;
  url: string;

  constructor(obj: AnyInit = {}, type: number) {
    this.contentType = type;
    this.id = obj.id ?? new PlatformID();
    this.name = obj.name ?? "";
    this.thumbnails = obj.thumbnails ?? new Thumbnails([]);
    this.author = obj.author;
    this.datetime = obj.datetime ?? obj.uploadDate ?? 0;
    this.url = obj.url ?? "";
  }
}

export class PlatformNestedMediaContent extends PlatformContent {
  contentUrl: string;
  contentName?: string;
  contentDescription?: string;
  contentProvider?: string;
  contentThumbnails: Thumbnails;

  constructor(obj: PlatformNestedMediaContentInit = {} as PlatformNestedMediaContentInit) {
    super(obj as AnyInit, 11);
    this.contentUrl = obj.contentUrl ?? "";
    this.contentName = obj.contentName;
    this.contentDescription = obj.contentDescription;
    this.contentProvider = obj.contentProvider;
    this.contentThumbnails = obj.contentThumbnails ?? new Thumbnails([]);
  }
}

export class PlatformLockedContent extends PlatformContent {
  contentName?: string;
  contentThumbnails: Thumbnails;
  unlockUrl: string;
  lockDescription?: string;

  constructor(obj: PlatformLockedContentInit = {} as PlatformLockedContentInit) {
    super(obj as AnyInit, 70);
    this.contentName = obj.contentName;
    this.contentThumbnails = obj.contentThumbnails ?? new Thumbnails([]);
    this.unlockUrl = obj.unlockUrl ?? "";
    this.lockDescription = obj.lockDescription;
  }
}

export class PlatformVideo extends PlatformContent {
  plugin_type: "PlatformVideo" | "PlatformVideoDetails" = "PlatformVideo";
  shareUrl?: string;
  duration: number;
  viewCount: number;
  playbackTime: number;
  playbackDate?: number;
  isLive: boolean;
  isShort: boolean;

  constructor(obj: PlatformVideoInit = {} as PlatformVideoInit) {
    super(obj as AnyInit, 1);
    this.shareUrl = obj.shareUrl;
    this.duration = obj.duration ?? -1;
    this.viewCount = obj.viewCount ?? -1;
    this.playbackTime = obj.playbackTime ?? -1;
    this.playbackDate = obj.playbackDate;
    this.isLive = obj.isLive ?? false;
    this.isShort = !!obj.isShort;
  }
}

export class PlatformVideoDetails extends PlatformVideo {
  override plugin_type: "PlatformVideoDetails" = "PlatformVideoDetails";
  description: string;
  video: VideoSourceDescriptor | UnMuxVideoSourceDescriptor | Record<string, never>;
  dash: DashSource | null;
  hls: HLSSource | null;
  live: HLSSource | DashSource | VideoUrlSource | null;
  rating: Rating | null;
  subtitles: Subtitle[];

  constructor(obj: PlatformVideoDetailsInit = {} as PlatformVideoDetailsInit) {
    super(obj as AnyInit);
    this.description = obj.description ?? "";
    this.video = (obj.video ?? {}) as VideoSourceDescriptor | UnMuxVideoSourceDescriptor | Record<string, never>;
    this.dash = (obj.dash as DashSource | null | undefined) ?? null;
    this.hls = (obj.hls as HLSSource | null | undefined) ?? null;
    this.live = (obj.live ?? null) as HLSSource | DashSource | VideoUrlSource | null;
    this.rating = obj.rating ?? null;
    this.subtitles = obj.subtitles ?? [];
    this.isShort = !!obj.isShort;
    if ((obj as AnyInit).getContentRecommendations) {
      (this as AnyInit).getContentRecommendations = obj.getContentRecommendations;
    }
  }
}

export class PlatformPost extends PlatformContent {
  plugin_type: "PlatformPost" | "PlatformPostDetails" = "PlatformPost";
  images: string[];
  description: string;

  constructor(obj: PlatformPostInit = {} as PlatformPostInit) {
    super(obj as AnyInit, 2);
    this.thumbnails = obj.thumbnails ?? [];
    this.images = obj.images ?? [];
    this.description = obj.description ?? "";
  }
}

export class PlatformPostDetails extends PlatformPost {
  override plugin_type: "PlatformPostDetails" = "PlatformPostDetails";
  rating: Rating;
  textType: TextType;
  content: string;

  constructor(obj: PlatformPostDetailsInit = {} as PlatformPostDetailsInit) {
    super(obj as AnyInit);
    this.rating = obj.rating ?? new RatingLikes(-1);
    this.textType = obj.textType ?? 0;
    this.content = obj.content ?? "";
  }
}

export class PlatformWeb extends PlatformContent {
  plugin_type: "PlatformWeb" | "PlatformWebDetails" = "PlatformWeb";
  constructor(obj: AnyInit = {}) {
    super(obj, 7);
  }
}

export class PlatformWebDetails extends PlatformWeb {
  override plugin_type: "PlatformWebDetails" = "PlatformWebDetails";
  html?: string;
  constructor(obj: AnyInit = {}) {
    super(obj);
    this.html = obj.html;
  }
}

export class PlatformArticle extends PlatformContent {
  plugin_type: "PlatformArticle" | "PlatformArticleDetails" = "PlatformArticle";
  declare rating: Rating;
  summary: string;

  constructor(obj: PlatformArticleInit = {} as PlatformArticleInit) {
    super(obj as AnyInit, 3);
    this.rating = obj.rating ?? new RatingLikes(-1);
    this.summary = obj.summary ?? "";
    this.thumbnails = obj.thumbnails ?? new Thumbnails([]);
  }
}

export class ArticleSegment {
  type: number;
  constructor(type: number) {
    this.type = type;
  }
}
export class ArticleTextSegment extends ArticleSegment {
  content: string;
  textType?: TextType;
  constructor(content: string, textType?: TextType) {
    super(1);
    this.textType = textType;
    this.content = content;
  }
}
export class ArticleImagesSegment extends ArticleSegment {
  images: string[];
  caption?: string;
  constructor(images: string[], caption?: string) {
    super(2);
    this.images = images;
    this.caption = caption;
  }
}
export class ArticleHeaderSegment extends ArticleSegment {
  level: number;
  content: string;
  constructor(content: string, level: number) {
    super(3);
    this.level = level;
    this.content = content;
  }
}
export class ArticleNestedSegment extends ArticleSegment {
  nested: ArticleSegment[];
  constructor(nested: ArticleSegment[]) {
    super(9);
    this.nested = nested;
  }
}

export class PlatformArticleDetails extends PlatformArticle {
  override plugin_type: "PlatformArticleDetails" = "PlatformArticleDetails";
  segments: ArticleSegment[];
  constructor(obj: PlatformArticleDetailsInit = {} as PlatformArticleDetailsInit) {
    super(obj as AnyInit);
    this.segments = (obj as AnyInit).segments ?? [];
  }
}

export class PlatformChannel {
  plugin_type: "PlatformChannel" = "PlatformChannel";
  id: string | PlatformIDShape;
  name: string;
  thumbnail?: string;
  banner?: string;
  subscribers: number;
  description?: string;
  url: string;
  urlAlternatives: string[];
  links: Record<string, string>;

  constructor(obj: PlatformChannelInit = {} as PlatformChannelInit) {
    this.id = obj.id ?? "";
    this.name = obj.name ?? "";
    this.thumbnail = obj.thumbnail;
    this.banner = obj.banner;
    this.subscribers = obj.subscribers ?? 0;
    this.description = obj.description;
    this.url = obj.url ?? "";
    this.urlAlternatives = obj.urlAlternatives ?? [];
    this.links = obj.links ?? {};
  }
}

export class PlatformPlaylist extends PlatformContent {
  plugin_type: "PlatformPlaylist" | "PlatformPlaylistDetails" = "PlatformPlaylist";
  videoCount: number;
  thumbnail?: string;

  constructor(obj: PlatformPlaylistInit = {} as PlatformPlaylistInit) {
    super(obj as AnyInit, 4);
    this.videoCount = obj.videoCount ?? -1;
    this.thumbnail = obj.thumbnail;
  }
}

export class PlatformPlaylistDetails extends PlatformPlaylist {
  override plugin_type: "PlatformPlaylistDetails" = "PlatformPlaylistDetails";
  contents: VideoPager;
  constructor(obj: PlatformPlaylistDetailsInit = {} as PlatformPlaylistDetailsInit) {
    super(obj as AnyInit);
    this.contents = (obj as AnyInit).contents;
  }
}

export class PlatformComment {
  plugin_type: "Comment" = "Comment";
  contextUrl: string;
  author: PlatformAuthorLink;
  message: string;
  rating: Rating;
  date: UnixTimestamp;
  replyCount: number;
  context: Record<string, unknown>;

  constructor(obj: PlatformCommentInit = {} as PlatformCommentInit) {
    this.contextUrl = obj.contextUrl ?? "";
    this.author = (obj as AnyInit).author ?? new PlatformAuthorLink(new PlatformID(), "", "", undefined);
    this.message = obj.message ?? "";
    this.rating = obj.rating ?? new RatingLikes(0);
    this.date = obj.date ?? 0;
    this.replyCount = obj.replyCount ?? 0;
    this.context = obj.context ?? {};
    if (obj.getReplies) (this as AnyInit).getReplies = obj.getReplies;
  }
}

/** Backcompat alias. */
export class Comment extends PlatformComment {}

export class PlaybackTracker {
  nextRequest: number;
  constructor(intervalMs?: number) {
    this.nextRequest = intervalMs ?? 10_000;
  }
  setProgress(_seconds: number): void {
    throw new ScriptImplementationException("Missing required setProgress(seconds) on PlaybackTracker");
  }
}

/* ============================================================================
 * Live events
 * ========================================================================== */

export class LiveEvent {
  type: number;
  constructor(type: number) {
    this.type = type;
  }
}
export class LiveEventComment extends LiveEvent {
  name: string;
  message: string;
  thumbnail?: string;
  colorName?: string | number;
  badges?: unknown[];
  constructor(name: string, message: string, thumbnail?: string, colorName?: string | number, badges?: unknown[]) {
    super(1);
    this.name = name;
    this.message = message;
    this.thumbnail = thumbnail;
    this.colorName = colorName;
    this.badges = badges;
  }
}
export class LiveEventEmojis extends LiveEvent {
  emojis: string[];
  constructor(emojis: string[]) {
    super(4);
    this.emojis = emojis;
  }
}
export class LiveEventDonation extends LiveEvent {
  amount: string;
  name: string;
  message: string;
  thumbnail?: string;
  expire?: number;
  colorDonation?: string | number;
  constructor(
    amount: string,
    name: string,
    message?: string,
    thumbnail?: string,
    expire?: number,
    colorDonation?: string | number,
  ) {
    super(5);
    this.amount = amount;
    this.name = name;
    this.message = message ?? "";
    this.thumbnail = thumbnail;
    this.expire = expire;
    this.colorDonation = colorDonation;
  }
}
export class LiveEventViewCount extends LiveEvent {
  viewCount: number;
  constructor(viewCount: number) {
    super(10);
    this.viewCount = viewCount;
  }
}
export class LiveEventRaid extends LiveEvent {
  targetUrl: string;
  targetName: string;
  targetThumbnail?: string;
  isOutgoing: boolean;
  constructor(targetUrl: string, targetName: string, targetThumbnail?: string, isOutgoing?: boolean) {
    super(100);
    this.targetUrl = targetUrl;
    this.targetName = targetName;
    this.targetThumbnail = targetThumbnail;
    this.isOutgoing = isOutgoing ?? true;
  }
}

/* ============================================================================
 * Pagers
 * ========================================================================== */

export class ContentPager {
  plugin_type: "ContentPager" = "ContentPager";
  results: PlatformContent[];
  hasMore: boolean;
  context: PagerContext;

  constructor(results?: PlatformContent[], hasMore?: boolean, context?: PagerContext) {
    this.results = results ?? [];
    this.hasMore = hasMore ?? false;
    this.context = context ?? {};
  }
  hasMorePagers(): boolean {
    return this.hasMore;
  }
  nextPage(): ContentPager {
    return new ContentPager([], false, this.context);
  }
}

export class VideoPager {
  plugin_type: "VideoPager" = "VideoPager";
  results: PlatformVideo[];
  hasMore: boolean;
  context: PagerContext;

  constructor(results?: PlatformVideo[], hasMore?: boolean, context?: PagerContext) {
    this.results = results ?? [];
    this.hasMore = hasMore ?? false;
    this.context = context ?? {};
  }
  hasMorePagers(): boolean {
    return this.hasMore;
  }
  nextPage(): VideoPager {
    return new VideoPager([], false, this.context);
  }
}

export class ChannelPager {
  plugin_type: "ChannelPager" = "ChannelPager";
  results: PlatformChannel[];
  hasMore: boolean;
  context: PagerContext;

  constructor(results?: PlatformChannel[], hasMore?: boolean, context?: PagerContext) {
    this.results = results ?? [];
    this.hasMore = hasMore ?? false;
    this.context = context ?? {};
  }
  hasMorePagers(): boolean {
    return this.hasMore;
  }
  nextPage(): ChannelPager {
    return new ChannelPager([], false, this.context);
  }
}

export class PlaylistPager {
  plugin_type: "PlaylistPager" = "PlaylistPager";
  results: PlatformPlaylist[];
  hasMore: boolean;
  context: PagerContext;

  constructor(results?: PlatformPlaylist[], hasMore?: boolean, context?: PagerContext) {
    this.results = results ?? [];
    this.hasMore = hasMore ?? false;
    this.context = context ?? {};
  }
  hasMorePagers(): boolean {
    return this.hasMore;
  }
  nextPage(): PlaylistPager {
    return new PlaylistPager([], false, this.context);
  }
}

export class CommentPager {
  plugin_type: "CommentPager" = "CommentPager";
  results: PlatformComment[];
  hasMore: boolean;
  context: PagerContext;

  constructor(results?: PlatformComment[], hasMore?: boolean, context?: PagerContext) {
    this.results = results ?? [];
    this.hasMore = hasMore ?? false;
    this.context = context ?? {};
  }
  hasMorePagers(): boolean {
    return this.hasMore;
  }
  nextPage(): CommentPager {
    return new CommentPager([], false, this.context);
  }
}

export class LiveEventPager {
  plugin_type: "LiveEventPager" = "LiveEventPager";
  results: LiveEvent[];
  hasMore: boolean;
  context: PagerContext;
  nextRequest: number;

  constructor(results?: LiveEvent[], hasMore?: boolean, context?: PagerContext) {
    this.results = results ?? [];
    this.hasMore = hasMore ?? false;
    this.context = context ?? {};
    this.nextRequest = 4000;
  }
  hasMorePagers(): boolean {
    return this.hasMore;
  }
  nextPage(): LiveEventPager {
    return new LiveEventPager([], false, this.context);
  }
}

/* ============================================================================
 * Globals factory (used by @grayjay/tester to build a vm context)
 * ========================================================================== */

export type PolyfillGlobals = Record<string, unknown>;

/** The engine's default `source` with no-op fallbacks, to be overridden. */
export function createDefaultSource(): Record<string, unknown> {
  return {
    getHome(): ContentPager {
      return new ContentPager([], false, {});
    },
    getShorts(): VideoPager {
      return new VideoPager([], false, {});
    },
    enable(_config: SourcePluginRuntimeConfig, _settings: PluginSettings, _savedState: string | null): void {},
    disable(): void {},
    searchSuggestions(_query: string): string[] {
      return [];
    },
    getSearchCapabilities(): { types: never[]; sorts: never[] } {
      return { types: [], sorts: [] };
    },
    search(_query: string): ContentPager {
      return new ContentPager([], false, {});
    },
    isChannelUrl(_url: string): boolean {
      return false;
    },
    getChannel(_url: string): null {
      return null;
    },
    getChannelCapabilities(): { types: never[]; sorts: never[] } {
      return { types: [], sorts: [] };
    },
    getChannelContents(_url: string): ContentPager {
      return new ContentPager([], false, {});
    },
    isContentDetailsUrl(_url: string): boolean {
      return false;
    },
    getContentDetails(_url: string): undefined {
      return undefined;
    },
  };
}

/**
 * Build the polyfill half of the plugin globals (everything except the
 * packages, which the harness supplies).
 */
export function createPolyfillGlobals(options: { log?: (message: string) => void } = {}): PolyfillGlobals {
  const logFn = options.log ?? (() => {});
  const source = createDefaultSource();
  return {
    IS_TESTING: true,
    Type,
    Language,
    source,
    plugin: { config: {}, settings: {} },
    log(str?: unknown): void {
      if (str === undefined || str === null) return;
      logFn(typeof str === "string" ? str : JSON.stringify(str, null, 4));
    },
    definePlugin(def: PluginDefinition): void {
      if (!def || typeof def !== "object") throw new Error("definePlugin expects an object of source methods");
      for (const key of Object.keys(def)) {
        (source as AnyInit)[key] = (def as AnyInit)[key];
      }
    },
    ScriptException,
    ScriptLoginRequiredException,
    LoginRequiredException,
    CaptchaRequiredException,
    CriticalException,
    UnavailableException,
    ReloadRequiredException,
    AgeException,
    TimeoutException,
    ScriptImplementationException,
    PlatformID,
    Thumbnail,
    Thumbnails,
    PlatformAuthorLink,
    RatingLikes,
    RatingLikesDislikes,
    RatingScaler,
    RequestModifier,
    VideoUrlSource,
    VideoUrlWidevineSource,
    VideoUrlRangeSource,
    AudioUrlSource,
    AudioUrlWidevineSource,
    AudioUrlRangeSource,
    HLSSource,
    DashSource,
    DashWidevineSource,
    DashManifestRawSource,
    DashManifestRawAudioSource,
    UMPSource,
    VideoSourceDescriptor,
    UnMuxVideoSourceDescriptor,
    PlatformContent,
    PlatformNestedMediaContent,
    PlatformLockedContent,
    PlatformVideo,
    PlatformVideoDetails,
    PlatformPost,
    PlatformPostDetails,
    PlatformWeb,
    PlatformWebDetails,
    PlatformArticle,
    ArticleSegment,
    ArticleTextSegment,
    ArticleImagesSegment,
    ArticleHeaderSegment,
    ArticleNestedSegment,
    PlatformArticleDetails,
    PlatformChannel,
    PlatformPlaylist,
    PlatformPlaylistDetails,
    PlatformComment,
    Comment,
    PlaybackTracker,
    LiveEvent,
    LiveEventComment,
    LiveEventEmojis,
    LiveEventDonation,
    LiveEventViewCount,
    LiveEventRaid,
    ContentPager,
    VideoPager,
    ChannelPager,
    PlaylistPager,
    CommentPager,
    LiveEventPager,
  };
}
