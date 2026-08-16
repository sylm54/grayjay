# PMVHaven (Grayjay plugin)

Typed rebuild of [sylm54/pmvhaven](https://github.com/sylm54/pmvhaven) on the grayjay devkit, keeping the original plugin id (`03fb92a4-…`) so it installs as an update.

## Features

| Area | Support |
| --- | --- |
| Home | Latest uploads (paginated) or Trending (all time / 24h / 1h) via plugin setting |
| Search | Full search with pagination, chronological sort, tag-based suggestions |
| Details | HLS master + progressive mp4 sources, likes/dislikes rating, rich description (tags, music, stats) |
| Related | Recommended videos from the watch page (cached per detail fetch) |
| Comments | Paginated, with replies via `getSubComments` |
| Channels | Info (avatar, banner, subs, socials), latest videos, playlists |
| Playlists | Full contents via `PlatformPlaylistDetails` |

Implementation notes (from investigating the site):

- Video URLs are `https://pmvhaven.com/video/<slug>_<24-hex-id>`; the slug is decorative, the id is canonical — the plugin accepts any slug.
- Search/trending/comments use the JSON API; video/channel/playlist pages are Nuxt SSR — the plugin decodes `__NUXT_DATA__` with a proper devalue resolver (`src/nuxt.ts`).
- The trending endpoint does not paginate server-side; channel pages embed the uploader's latest videos (one page).
- Dropdown setting values are stored as 0-based indices because the engines `JSON.parse` setting values (a plain-text default crashes `parseSettings` at startup — the devkit's `gj validate` now warns about this).

## Commands

```bash
bun install
bunx --bun gj test                            # build + 13 fixture-based tests (offline)
bunx --bun gj validate
bunx --bun gj serve --watch                   # DevServer testing on device
bunx --bun gj test --desktop search bbc       # run through the desktop Grayjay.Engine (live)
bunx --bun gj test --desktop details https://pmvhaven.com/video/bbc-craving_6a819aaae4c7e4c46df5d55c
bunx --bun gj release                         # build --sign --bump --minify
```

## Publishing

This repo's CI (`.github/workflows/ci.yml`) builds and validates every plugin in `plugins/` on each push, then uploads the dist artifacts to the **fixed `release` tag**:

```
https://github.com/sylm54/grayjay/releases/download/release/PMVHavenConfig.json
```

That URL is the plugin's `sourceUrl` — stable across releases, so installed apps keep polling it for updates. Add the optional `GRAYJAY_SIGNING_KEY` repo secret (base64 of the PEM from `bunx --bun gj build --sign`) to release signed builds; back the key up — it is the author identity.

> Users who installed the original plugin from the `sylm54/pmvhaven` raw URL poll that old URL: either keep copying `dist/` artifacts there (`PMVHavenConfig.json`, `PMVHavenScript.js`, `icon.png`) or reinstall once from this repo's release URL above.

Local release build: `bunx --bun gj release` (= build --sign --bump --minify; bump the version before publishing so clients pick up the update).

## Tests

`src/index.test.ts` runs the **built bundle** against captured live responses in `test-fixtures/` (trimmed to the `__NUXT_DATA__` payloads and API JSON). No network needed; re-capture fixtures with curl if the site changes.

Verified through the desktop Grayjay.Engine (ClearScript V8, live network): search, home, details (HLS+mp4, rating), channel, playlist, comments, suggestions.
