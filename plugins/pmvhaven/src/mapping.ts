/** Map pmvhaven API models to Grayjay engine content types. */

import type { ApiChannelUser, ApiComment, ApiPlaylist, ApiVideo } from "./models.js";
import { videoUrl } from "./api.js";

const PLATFORM = "PMVHaven";

function pluginId(): string {
  return plugin.config.id;
}

function parseDate(iso?: string): number {
  if (!iso) return 0;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
}

function parseDurationSeconds(video: ApiVideo): number {
  if (typeof video.durationSeconds === "number" && video.durationSeconds > 0) return video.durationSeconds;
  if (typeof video.duration === "string") {
    const parts = video.duration.split(":").map((part) => Number.parseInt(part, 10));
    if (parts.length === 2 && parts.every((n) => !Number.isNaN(n))) return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
    if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
      return (parts[0] ?? 0) * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0);
    }
  }
  return -1;
}

function thumbnails(video: ApiVideo): Thumbnails {
  const sources: Thumbnail[] = [];
  if (video.thumbnailUrl) sources.push(new Thumbnail(video.thumbnailUrl, video.height ?? 720));
  if (video.previewUrl && video.previewUrl !== video.thumbnailUrl) {
    // Animated preview — same frame budget, offered as a lower-quality variant.
    sources.push(new Thumbnail(video.previewUrl, Math.max(0, Math.floor((video.height ?? 720) / 2))));
  }
  return new Thumbnails(sources);
}

export function authorLink(video: ApiVideo): PlatformAuthorLink {
  const username = video.uploaderUsername ?? video.uploader ?? "unknown";
  return new PlatformAuthorLink(
    new PlatformID(PLATFORM, video.uploaderId ?? username, pluginId()),
    username,
    `https://pmvhaven.com/users/${encodeURIComponent(username)}`,
    video.uploaderAvatarUrl,
  );
}

export function toFeedVideo(video: ApiVideo): PlatformVideo {
  return new PlatformVideo({
    id: new PlatformID(PLATFORM, video._id, pluginId()),
    name: video.title || "Untitled",
    thumbnails: thumbnails(video),
    author: authorLink(video),
    datetime: parseDate(video.uploadDate),
    duration: parseDurationSeconds(video),
    viewCount: typeof video.views === "number" ? video.views : -1,
    url: videoUrl(video._id, video.title),
    isLive: false,
  });
}

/** Rich description: tags, music and engagement on top of the raw text. */
export function buildDescription(video: ApiVideo): string {
  const plain = (video.description ?? "").trim();
  // "Description style": 0 = Rich, 1 = Plain (dropdown indices).
  const style = (plugin.settings as Record<string, unknown>)["Description style"];
  const parsedStyle = typeof style === "number" ? style : Number.parseInt(String(style ?? "0"), 10);
  if (parsedStyle === 1) return plain;

  const lines: string[] = [];
  if (plain) lines.push(plain);

  const stats: string[] = [];
  if (typeof video.views === "number") stats.push(`${formatCount(video.views)} views`);
  if (typeof video.likes === "number" || typeof video.dislikes === "number") {
    stats.push(`👍 ${formatCount(video.likes ?? 0)} · 👎 ${formatCount(video.dislikes ?? 0)}`);
  }
  if (typeof video.bayesianRating === "number" && video.bayesianRating > 0) {
    stats.push(`rated ${Math.round(video.bayesianRating)}%`);
  }
  if (stats.length) lines.push(stats.join(" · "));

  const tags = (video.top5Tags?.length ? video.top5Tags : video.tags) ?? [];
  if (tags.length) lines.push(tags.slice(0, 10).map((tag) => `#${tag.replace(/\s+/g, "")}`).join(" "));

  const music = (video.music ?? [])
    .filter((entry) => entry.artist || entry.song)
    .slice(0, 3)
    .map((entry) => `🎵 ${[entry.artist, entry.song].filter(Boolean).join(" — ")}`)
    .join("\n");
  if (music) lines.push(music);

  return lines.join("\n\n");
}

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export interface VideoSources {
  descriptor: VideoSourceDescriptor | UnMuxVideoSourceDescriptor;
  live: HLSSource | null;
}

/**
 * Playback sources: HLS master playlist (adaptive) plus the progressive mp4
 * (original file) as a fallback.
 */
export function buildVideoSources(video: ApiVideo): VideoSources {
  const duration = parseDurationSeconds(video);
  const sources: VideoUrlSource[] = [];

  // Progressive mp4 = the original file; always offered when present.
  if (video.videoUrl) {
    sources.push(
      new VideoUrlSource({
        width: video.width ?? 0,
        height: video.height ?? 0,
        container: "video/mp4",
        codec: "avc1.4d401e",
        name: `${video.height ?? 0}p mp4 (direct)`,
        duration: Math.max(duration, 0),
        url: video.videoUrl,
      }),
    );
  }

  const hlsReady = video.hlsEnabled === true && video.hlsStatus === "completed" && !!video.hlsMasterPlaylistUrl;
  return {
    descriptor: new VideoSourceDescriptor(sources),
    live: hlsReady
      ? new HLSSource({
          name: "HLS (adaptive)",
          duration: Math.max(duration, 0),
          url: video.hlsMasterPlaylistUrl!,
          priority: false,
        })
      : null,
  };
}

export function toVideoDetails(video: ApiVideo): PlatformVideoDetails {
  const { descriptor, live } = buildVideoSources(video);
  const likes = typeof video.likes === "number" ? video.likes : 0;
  const dislikes = typeof video.dislikes === "number" ? video.dislikes : 0;

  return new PlatformVideoDetails({
    id: new PlatformID(PLATFORM, video._id, pluginId()),
    name: video.title || "Untitled",
    thumbnails: thumbnails(video),
    author: authorLink(video),
    datetime: parseDate(video.uploadDate),
    duration: parseDurationSeconds(video),
    viewCount: typeof video.views === "number" ? video.views : -1,
    url: videoUrl(video._id, video.title),
    isLive: false,
    description: buildDescription(video),
    video: descriptor,
    live,
    rating: new RatingLikesDislikes(likes, dislikes),
    subtitles: [],
  });
}

export function toChannel(user: ApiChannelUser): PlatformChannel {
  const links: Record<string, string> = {};
  for (const [key, value] of Object.entries(user.socialLinks ?? {})) {
    if (value) links[key] = value;
  }

  return new PlatformChannel({
    // The engine expects a PlatformID object here (official plugins do this).
    id: new PlatformID(PLATFORM, user.userId ?? user.username, pluginId()),
    name: user.username,
    thumbnail: user.avatarUrl,
    banner: user.bannerUrl || undefined,
    subscribers: user.subscribersCount ?? 0,
    description: user.bio ?? "",
    url: `https://pmvhaven.com/users/${encodeURIComponent(user.username)}`,
    links,
  });
}

export function toPlaylistEntry(playlist: ApiPlaylist): PlatformPlaylist {
  const author = new PlatformAuthorLink(
    new PlatformID(PLATFORM, playlist.ownerId ?? playlist.owner ?? "unknown", pluginId()),
    playlist.ownerUsername ?? playlist.owner ?? "unknown",
    `https://pmvhaven.com/users/${encodeURIComponent(playlist.ownerUsername ?? playlist.owner ?? "unknown")}`,
    playlist.ownerAvatarUrl,
  );

  return new PlatformPlaylist({
    id: new PlatformID(PLATFORM, playlist._id, pluginId()),
    name: playlist.name,
    thumbnails: new Thumbnails(playlist.thumbnailUrl ? [new Thumbnail(playlist.thumbnailUrl, 720)] : []),
    author,
    datetime: parseDate(playlist.createdAt),
    url: `https://pmvhaven.com/playlists/${playlist._id}`,
    videoCount: playlist.videoCount ?? (playlist.videoDetails?.length ?? -1),
    thumbnail: playlist.thumbnailUrl,
  });
}

export function toPlaylistDetails(playlist: ApiPlaylist): PlatformPlaylistDetails {
  const entry = toPlaylistEntry(playlist);
  const videos = (playlist.videoDetails ?? []).map(toFeedVideo);
  return new PlatformPlaylistDetails({
    id: entry.id,
    name: entry.name,
    thumbnails: entry.thumbnails,
    author: entry.author,
    datetime: entry.datetime,
    url: entry.url,
    videoCount: entry.videoCount,
    thumbnail: playlist.thumbnailUrl,
    contents: new VideoPager(videos, false, {}),
  });
}

export function toComment(comment: ApiComment, contextUrl: string): PlatformComment {
  const username = comment.username ?? "anonymous";
  return new PlatformComment({
    contextUrl,
    author: new PlatformAuthorLink(
      new PlatformID(PLATFORM, comment.userId ?? username, pluginId()),
      username,
      `https://pmvhaven.com/users/${encodeURIComponent(username)}`,
      comment.avatarUrl ?? undefined,
    ),
    message: comment.text ?? "",
    rating: new RatingLikesDislikes(comment.likes ?? 0, comment.dislikes ?? 0),
    date: parseDate(comment.createdAt),
    replyCount: comment.replies?.length ?? 0,
    context: {
      videoId: videoIdOfContextUrl(contextUrl),
      replies: comment.replies ?? [],
    },
  });
}

function videoIdOfContextUrl(url: string): string {
  const match = url.match(/_([0-9a-f]{24})(?:[?#].*)?$/i);
  return match?.[1] ?? "";
}
