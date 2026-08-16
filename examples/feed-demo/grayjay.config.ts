import { defineConfig, setting } from "@grayjay/config";

/**
 * FeedDemo — a fully offline example plugin.
 *
 * It serves synthetic, deterministic data (great for tests and demos) but
 * exercises the complete plugin surface: pagers, search, channels, comments,
 * playlists, settings, exceptions and state persistence.
 */
export default defineConfig({
  name: "FeedDemo",
  description: "Synthetic demo platform showing the grayjay devkit end to end.",
  author: "grayjay devkit",
  authorUrl: "https://example.com",
  repositoryUrl: "https://github.com/you/grayjay-plugins",

  version: 1,
  id: "6f6d2d64-9a1a-4bdf-9e75-9d0aa70d4a18",
  iconUrl: "./FeedDemoIcon.png",

  packages: ["Http"],
  allowUrls: ["api.feeddemo.test", "feeddemo.test"],

  // Stable release URL (the CI workflow publishes to the fixed "release" tag):
  sourceUrl: "https://github.com/YOU/REPO/releases/download/release/FeedDemoConfig.json",

  settings: [
    setting.header("Feed"),
    setting.dropdown("Feed size", "Items per feed page", ["5", "10", "20"], "10"),
    setting.boolean("Include live", "Add a fake live stream to feeds", true),
  ],

  changelog: {
    "1": ["Initial release of the FeedDemo example plugin."],
  },
});
