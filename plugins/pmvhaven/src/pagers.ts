/** Pagers over the paginated and single-shot pmvhaven feeds. */

import type { ApiComment, ApiVideo } from "./models.js";
import { getComments, getTrending, searchVideos } from "./api.js";
import { toComment, toFeedVideo } from "./mapping.js";

interface PageLike {
  totalPages?: number;
  hasNext?: boolean;
}

function hasMore(pagination: PageLike, page: number, got: number): boolean {
  if (got === 0) return false;
  if (pagination.hasNext === true) return true;
  if (typeof pagination.totalPages === "number") return page < pagination.totalPages;
  return false;
}

/**
 * Search-backed pager. The search API paginates with `page` and reports
 * `hasNext`/`totalPages`.
 */
export class SearchPager extends VideoPager {
  private readonly query: string;
  private readonly sort?: "uploadDate";
  private page: number;

  constructor(query: string, sort: "uploadDate" | undefined, firstPage: { videos: ApiVideo[]; pagination: PageLike }, page: number) {
    super(firstPage.videos.map(toFeedVideo), hasMore(firstPage.pagination, page, firstPage.videos.length), { query });
    this.query = query;
    this.sort = sort;
    this.page = page;
  }

  override nextPage(): SearchPager {
    this.page += 1;
    const { videos, pagination } = searchVideos(this.query, this.page, this.sort);
    this.results = videos.map(toFeedVideo);
    this.hasMore = hasMore(pagination, this.page, videos.length);
    return this;
  }
}

/**
 * The trending endpoint ignores pagination parameters server-side: it always
 * returns one page of currently-hot videos.
 */
export class TrendingPager extends VideoPager {
  constructor(period: "1h" | "24h" | "all") {
    super(getTrending(period).map(toFeedVideo), false, { period });
  }
}

/** Comments pager over /api/videos/{id}/comments. */
export class PmvCommentsPager extends CommentPager {
  private readonly videoId: string;
  private readonly contextUrl: string;
  private page: number;

  constructor(videoId: string, contextUrl: string, comments: ApiComment[], pagination: PageLike, page: number) {
    super(comments.map((comment) => toComment(comment, contextUrl)), hasMore(pagination, page, comments.length), { videoId });
    this.videoId = videoId;
    this.contextUrl = contextUrl;
    this.page = page;
  }

  override nextPage(): PmvCommentsPager {
    this.page += 1;
    const { comments, pagination } = getComments(this.videoId, this.page);
    this.results = comments.map((comment) => toComment(comment, this.contextUrl));
    this.hasMore = hasMore(pagination, this.page, comments.length);
    return this;
  }
}
