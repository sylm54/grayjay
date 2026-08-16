import { defineConfig, setting } from "@grayjay/config";

/**
 * PMVHaven — typed rebuild on the grayjay devkit.
 *
 * Keeps the original plugin id so it installs as an update of
 * github.com/sylm54/pmvhaven.
 */
export default defineConfig({
  name: "PMVHaven",
  description: "Videos, channels, playlists, comments and search on pmvhaven.com.",
  author: "sylm54",
  authorUrl: "https://github.com/sylm54",
  repositoryUrl: "https://github.com/sylm54/pmvhaven",

  // One above the last published version of the original plugin.
  version: 13,
  id: "03fb92a4-f857-4f45-a7bf-00c1660e75cb",
  iconUrl: "./icon.png",

  packages: ["Http"],
  allowUrls: [
    "pmvhaven.com",
    // S3-backed CDN for thumbnails, previews and video files.
    "pmvhavencloud.s3.eu-west-par.io.cloud.ovh.net",
  ],

  // Update target for installed plugins: this repo's CI publishes every
  // build to the fixed "release" tag, so this URL is stable across releases.
  sourceUrl: "https://github.com/sylm54/grayjay/releases/download/release/PMVHavenConfig.json",

  settings: [
    setting.header("Feeds"),
    // NOTE: dropdown values are stored as 0-based indices into the options
    // list — the engines JSON.parse setting values, so plain-text defaults
    // would crash `parseSettings` at startup.
    setting.dropdown(
      "Home feed",
      "What the Home tab shows.",
      ["Latest uploads", "Trending (all time)", "Trending (24 hours)", "Trending (1 hour)"],
      "0",
    ),
    setting.header("Details"),
    setting.dropdown("Description style", "How much metadata the video description contains.", ["Rich", "Plain"], "0"),
  ],

  changelog: {
    "13": [
      "Feature: channel pages (info, videos, playlists);",
      "Feature: playlist pages with full contents;",
      "Feature: comments and replies;",
      "Feature: tag-based search suggestions;",
      "Feature: related videos on the detail page;",
      "Feature: HLS + progressive playback sources, likes/dislikes rating;",
      "Fix: stable video ids, correct pagination, scoped allowUrls;",
      "Typed rebuild on the grayjay devkit;",
    ],
  },
});
