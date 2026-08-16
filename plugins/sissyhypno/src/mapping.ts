/** Map scraped site data onto engine plugin models. */

import {
  PLATFORM,
  type ScrapedChannel,
  type ScrapedComment,
  type ScrapedVideo,
  type ScrapedVideoDetails,
  userIdFromUrl,
} from "./scrape.js";

function pluginId(): string {
  return plugin.config.id;
}

function pid(id: string): PlatformID {
  return new PlatformID(PLATFORM, id, pluginId());
}

function thumbnails(url: string): Thumbnails {
  return url ? new Thumbnails([new Thumbnail(url, 720)]) : new Thumbnails([]);
}

export function toFeedVideo(video: ScrapedVideo): PlatformVideo {
  return new PlatformVideo({
    id: pid(video.id),
    name: video.title,
    thumbnails: thumbnails(video.thumbnail),
    duration: video.duration,
    viewCount: video.viewCount,
    url: video.url,
    isLive: false,
  });
}

function buildDescription(details: ScrapedVideoDetails): string {
  const parts: string[] = [];
  if (details.description) parts.push(details.description);
  if (details.tags.length) parts.push(`Tags: ${details.tags.map((t) => t.name).join(", ")}`);
  if (details.categories.length) parts.push(`Categories: ${details.categories.map((c) => c.name).join(", ")}`);
  return parts.join("\n");
}

export function toVideoDetails(details: ScrapedVideoDetails): PlatformVideoDetails {
  // The grid only exposes the like percentage and total vote count; split the
  // votes accordingly (rounded, at least one like when rated positively).
  const likes = Math.round((details.ratingPercent / 100) * details.ratingVotes);
  const dislikes = details.ratingVotes - likes;

  return new PlatformVideoDetails({
    id: pid(details.id),
    name: details.title,
    thumbnails: thumbnails(details.thumbnail),
    author: details.author
      ? new PlatformAuthorLink(
          pid(userIdFromUrl(details.author.url) ?? details.author.url),
          details.author.name,
          details.author.url,
          details.author.thumbnail,
        )
      : undefined,
    datetime: details.datetime ?? undefined,
    duration: details.duration,
    viewCount: details.viewCount,
    url: details.url,
    isLive: false,
    description: buildDescription(details),
    video: new VideoSourceDescriptor([
      new VideoUrlSource({
        // The page exposes a single progressive file with no resolution
        // metadata; claim 1080p like the site's "Best Quality" default.
        width: 1920,
        height: 1080,
        container: details.container,
        name: details.sourceTitle,
        url: details.videoUrl,
      }),
    ]),
    rating: new RatingLikesDislikes(likes, dislikes),
    subtitles: [],
    getContentRecommendations: (..._args: unknown[]) => {
      // The engines invoke this on the details object with zero arguments
      // (Android and desktop both check HasFunction("getContentRecommendations")).
      return new VideoPager(details.related.map(toFeedVideo), false, { url: details.url });
    },
  });
}

export function toChannel(channel: ScrapedChannel): PlatformChannel {
  const description = channel.fields.map((f) => `${f.label}: ${f.value}`).join("\n");
  return new PlatformChannel({
    id: pid(channel.id),
    name: channel.name,
    thumbnail: channel.thumbnail,
    banner: channel.thumbnail,
    url: channel.url,
    description,
  });
}

export function toComment(comment: ScrapedComment, contextUrl: string): PlatformComment {
  return new Comment({
    author: new PlatformAuthorLink(
      pid(comment.authorUrl || comment.authorName),
      comment.authorName || "Anonymous",
      comment.authorUrl,
      comment.authorThumbnail,
    ),
    message: comment.message,
    date: comment.date ?? undefined,
    contextUrl,
  });
}
