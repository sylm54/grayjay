import { defineConfig, setting } from "@grayjay/config";

/**
 * SissyHypno — typed rebuild on the grayjay devkit.
 *
 * Keeps the original plugin id so it installs as an update of
 * github.com/sylm54/shypno.
 */
export default defineConfig({
  name: "Sissyhypno",
  description: "Videos, search, channels, comments and related videos on sissyhypno.com.",
  author: "sylm54",
  authorUrl: "https://github.com/sylm54",
  repositoryUrl: "https://github.com/sylm54/shypno",

  // Bump on releases; installed apps poll sourceUrl and compare versions.
  version: 2,
  id: "39ab8413-7d84-4bab-8bfa-94e483c1bbb3",
  iconUrl: "./SissyHypnoIcon.png",

  packages: ["Http", "DOMParser"],
  allowUrls: [
    "sissyhypno.com",
    "www.sissyhypno.com",
  ],

  // Update target for installed plugins: this repo's CI publishes every
  // build to the fixed "release" tag, so this URL is stable across releases.
  sourceUrl: "https://github.com/sylm54/grayjay/releases/download/release/SissyhypnoConfig.json",

  settings: [
    setting.header("Feeds"),
    // NOTE: dropdown values are stored as 0-based indices into the options
    // list — the engines JSON.parse setting values, so plain-text defaults
    // would crash `parseSettings` at startup.
    setting.dropdown("Home feed", "What the Home tab shows.", ["Latest", "Top Rated", "Most Discussed", "Most Viewed"], "0"),
    setting.dropdown(
      "Home feed timeframe",
      "Over what timeframe the home feed is aggregated.",
      ["All Time", "Today", "Week", "Month"],
      "0",
    ),
  ],

  changelog: {
    "2": [
      "Feature: working search (the old plugin threw “This is a sample”);",
      "Feature: video details with description, tags, categories, upload date, duration, view count and rating;",
      "Feature: comments (the old parser built results but returned a broken placeholder);",
      "Feature: related videos on the detail page;",
      "Feature: channel pages with paginated uploads;",
      "Fix: stable video ids, correct pagination, scoped allowUrls;",
      "Typed rebuild on the grayjay devkit;",
    ],
  },
});
