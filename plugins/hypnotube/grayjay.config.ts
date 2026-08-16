import { defineConfig, setting } from "@grayjay/config";

/**
 * Hypnotube — typed rebuild on the grayjay devkit.
 *
 * Keeps the original plugin id so it installs as an update of
 * github.com/sylm54/hypnotube.
 */
export default defineConfig({
  name: "Hypnotube",
  description: "Videos, search, channels, playlists and comments on hypnotube.com.",
  author: "sylm54",
  authorUrl: "https://github.com/sylm54",
  repositoryUrl: "https://github.com/sylm54/hypnotube",

  // Bump on releases; installed apps poll sourceUrl and compare versions.
  version: 28,
  id: "bde2d2b1-0056-4053-901d-5f2861eb5b1b",
  iconUrl: "./HypnotubeIcon.png",

  packages: ["Http", "DOMParser"],
  allowUrls: [
    "hypnotube.com",
    // CDN for thumbnails and avatars.
    "cdn.hypnotube.com",
    // Tokenized progressive video files.
    "media.hypnotube.com",
  ],

  // Update target for installed plugins: this repo's CI publishes every
  // build to the fixed "release" tag, so this URL is stable across releases.
  sourceUrl: "https://github.com/sylm54/grayjay/releases/download/release/HypnotubeConfig.json",

  settings: [
    setting.header("Feeds"),
    // NOTE: dropdown values are stored as 0-based indices into the options
    // list — the engines JSON.parse setting values, so plain-text defaults
    // would crash `parseSettings` at startup.
    setting.dropdown(
      "Home feed",
      "What the Home tab shows.",
      ["Latest", "Top rated", "Most discussed", "Most viewed"],
      "0",
    ),
    setting.dropdown(
      "Home feed timeframe",
      "Timeframe the home feed is aggregated over (Latest ignores it).",
      ["All time", "Today", "Week", "Month"],
      "0",
    ),
  ],

  changelog: {
    "28": [
      "Fix: age gate — the site now redirects every request to /age-gate; the plugin establishes a session, passes the gate once and reuses the session cookie;",
      "Fix: search (the site moved to /search/videos/<query>/ with newest/rating/views sorts);",
      "Fix: video details parsing for the current template (plyr player, stats row, author card);",
      "Fix: comments parsing (removed a reference to an undefined variable that crashed every call);",
      "Feature: video metadata — duration, views, upload date, rating, tags, description;",
      "Feature: related videos on the detail page with uploader fallback;",
      "Feature: playlists;",
      "Typed rebuild on the grayjay devkit;",
    ],
  },
});
