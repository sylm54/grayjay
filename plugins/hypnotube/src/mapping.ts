/** Map hypnotube site models to Grayjay engine content types. */

import type { FeedItem, SiteComment, SitePlaylist, SiteUser, VideoPage, VideoSource } from "./api.js";
import { uploaderVideos } from "./api.js";

const PLATFORM = "Hypnotube";

function pluginId(): string {
  return plugin.config.id;
}

function thumbnails(item: { thumbnail?: string }): Thumbnails {
  return new Thumbnails(item.thumbnail ? [new Thumbnail(item.thumbnail, 720)] : []);
}

export function toFeedVideo(item: FeedItem): PlatformVideo {
  return new PlatformVideo({
    id: new PlatformID(PLATFORM, item.id, pluginId()),
    name: item.title,
    thumbnails: thumbnails(item),
    // Grid items don't expose the uploader or the upload date.
    datetime: 0,
    duration: item.duration,
    viewCount: item.viewCount,
    url: item.url,
    isLive: false,
  });
}

function ratingFrom(percent: number, votes: number): RatingLikesDislikes | undefined {
  if (votes <= 0) return undefined;
  const likes = Math.round((votes * Math.min(Math.max(percent, 0), 100)) / 100);
  return new RatingLikesDislikes(likes, votes - likes);
}

/** Rich description: raw text plus tags and stats. */
export function buildDescription(page: VideoPage): string {
  const lines: string[] = [];
  if (page.description.trim()) lines.push(page.description.trim());
  if (page.tags.length) lines.push(page.tags.map((tag) => `#${tag.replace(/\s+/g, "")}`).join(" "));
  const stats: string[] = [];
  if (page.viewCount > 0) stats.push(`${page.viewCount} views`);
  if (page.ratingPercent > 0) stats.push(`rated ${page.ratingPercent}% (${page.voteCount} votes)`);
  if (stats.length) lines.push(stats.join(" · "));
  return lines.join("\n\n");
}

export function toVideoDetails(page: VideoPage): PlatformVideoDetails {
  const sources: VideoUrlSource[] = page.sources.map((source: VideoSource) => sourceToVideoUrl(source, page.duration));
  const canonicalUrl = page.url;

  return new PlatformVideoDetails({
    id: new PlatformID(PLATFORM, page.id, pluginId()),
    name: page.title,
    thumbnails: thumbnails(page),
    author: page.author
      ? new PlatformAuthorLink(
          new PlatformID(PLATFORM, page.author.id, pluginId()),
          page.author.name,
          page.author.url,
          page.author.avatar,
        )
      : undefined,
    datetime: page.uploadDate,
    duration: page.duration,
    viewCount: page.viewCount,
    url: canonicalUrl,
    isLive: false,
    description: buildDescription(page),
    video: new VideoSourceDescriptor(sources),
    rating: ratingFrom(page.ratingPercent, page.voteCount),
    subtitles: [],
    // The engines invoke this on the details object with zero arguments
    // (Android and desktop both check `HasFunction("getContentRecommendations")`),
    // so the closure is self-contained: related videos, or the uploader's
    // other videos when the page has no related grid.
    getContentRecommendations: (..._args: unknown[]) => {
      const related = page.related.length > 0 ? page.related : page.author ? uploaderVideos(page.author.url) : [];
      return new VideoPager(related.map(toFeedVideo), false, { url: canonicalUrl });
    },
  });
}

function sourceToVideoUrl(source: VideoSource, duration: number): VideoUrlSource {
  return new VideoUrlSource({
    width: 0,
    height: source.height,
    container: source.container,
    name: `${source.height}p mp4`,
    duration: Math.max(duration, 0),
    url: source.url,
  });
}

export function toChannel(user: SiteUser): PlatformChannel {
  return new PlatformChannel({
    id: new PlatformID(PLATFORM, user.id, pluginId()),
    name: user.name,
    thumbnail: user.avatar,
    url: user.url,
  });
}

export function toComment(comment: SiteComment, contextUrl: string): PlatformComment {
  return new PlatformComment({
    contextUrl,
    author: new PlatformAuthorLink(
      new PlatformID(PLATFORM, comment.authorName, pluginId()),
      comment.authorName,
      comment.authorUrl ?? "",
      comment.avatar,
    ),
    message: comment.message,
    date: comment.date,
    replyCount: 0,
  });
}

export function toPlaylistDetails(playlist: SitePlaylist, videos: FeedItem[]): PlatformPlaylistDetails {
  return new PlatformPlaylistDetails({
    id: new PlatformID(PLATFORM, playlist.id, pluginId()),
    name: playlist.name,
    thumbnails: thumbnails(playlist),
    datetime: 0,
    url: playlist.url,
    videoCount: playlist.videoCount,
    thumbnail: playlist.thumbnail,
    contents: new VideoPager(videos.map(toFeedVideo), false, {}),
  });
}
