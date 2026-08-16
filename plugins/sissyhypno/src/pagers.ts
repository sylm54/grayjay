/** Pagers over sissyhypno.com's pageN.html-paginated HTML grids. */

import { fetchFeedPage, type ScrapedVideo } from "./scrape.js";
import { toFeedVideo } from "./mapping.js";

/**
 * Generic grid pager: page 1 is the bare base url, later pages append
 * `pageN.html`. Stops when the site reports no results or returns an
 * empty grid.
 */
export class GridPager extends VideoPager {
  private readonly baseUrl: string;
  private page: number;

  constructor(baseUrl: string, firstPage: ScrapedVideo[] | null, page: number, context: PagerContext) {
    const results = firstPage ?? [];
    super(results.map(toFeedVideo), results.length > 0, context);
    this.baseUrl = baseUrl;
    this.page = page;
  }

  override nextPage(): GridPager {
    this.page += 1;
    const videos = fetchFeedPage(this.baseUrl, this.page);
    this.results = (videos ?? []).map(toFeedVideo);
    this.hasMore = this.results.length > 0;
    return this;
  }
}
