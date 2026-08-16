/** Pagers over hypnotube's pageN.html-paginated grids. */

import { fetchHtml, isEmptyResults, pageUrl, parseVideoGrid, startSearch, type FeedItem } from "./api.js";
import { toFeedVideo } from "./mapping.js";

/** Pacing/retry for search pages (the server drops bursty or repeated renders). */
const SEARCH_PAGE_DELAY_MS = 900;
const SEARCH_PAGE_RETRY_MS = 1500;

/**
 * All grids paginate the same way: append pageN.html to the bare listing url.
 * An empty or missing grid ends the pager.
 */
export class GridPager extends VideoPager {
  private readonly listingUrl: string;
  private page: number;

  constructor(listingUrl: string, page = 1) {
    const items = GridPager.load(listingUrl, page);
    super(items.map(toFeedVideo), items.length > 0, { url: listingUrl });
    this.listingUrl = listingUrl;
    this.page = page;
  }

  protected static load(listingUrl: string, page: number): FeedItem[] {
    const html = fetchHtml(pageUrl(listingUrl, page));
    if (isEmptyResults(html)) return [];
    return parseVideoGrid(html);
  }

  override nextPage(): GridPager {
    this.page += 1;
    const items = GridPager.load(this.listingUrl, this.page);
    this.results = items.map(toFeedVideo);
    this.hasMore = items.length > 0;
    return this;
  }
}

/**
 * Search-backed grid pager. The searchgate POST's redirect landing is the
 * first results page (a separate GET would be a "repeat" render, which the
 * server answers with an empty grid); later pages are paced GETs with one
 * retry against the anti-bot throttling.
 */
export class SearchPager extends VideoPager {
  private readonly listingUrl: string;
  private page: number;

  constructor(query: string, listingUrl: string) {
    const landing = startSearch(query);
    const items = parseVideoGrid(landing.body);
    super(items.map(toFeedVideo), items.length > 0, { query });
    this.listingUrl = listingUrl;
    this.page = 1;
  }

  override nextPage(): SearchPager {
    this.page += 1;
    bridge.sleep(SEARCH_PAGE_DELAY_MS);
    let items = SearchPager.loadPage(this.listingUrl, this.page);
    if (items.length === 0) {
      bridge.sleep(SEARCH_PAGE_RETRY_MS);
      items = SearchPager.loadPage(this.listingUrl, this.page);
    }
    this.results = items.map(toFeedVideo);
    this.hasMore = items.length > 0;
    return this;
  }

  private static loadPage(listingUrl: string, page: number): FeedItem[] {
    const html = fetchHtml(pageUrl(listingUrl, page));
    if (isEmptyResults(html)) return [];
    return parseVideoGrid(html);
  }
}
