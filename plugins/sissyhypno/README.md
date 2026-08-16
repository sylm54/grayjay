# Sissyhypno (Grayjay plugin)

Typed rebuild of [sylm54/shypno](https://github.com/sylm54/shypno) on the grayjay devkit. Keeps the original plugin id (`39ab8413-…`) so it installs as an update of the old plugin.

## What it supports

- **Home feeds** — Latest / Top Rated / Most Discussed / Most Viewed, each aggregatable over All Time / Today / Week / Month (settings), with full `pageN.html` pagination.
- **Search** — the old plugin threw "This is a sample"; this one actually searches (`/search/<query>/`, paginated).
- **Video details** — title, description, tags, categories, upload date, duration, view count, like rating (percentage + vote count split into likes/dislikes), direct mp4 source, author link.
- **Related videos** — served both source-level and from the details object (recommendations on the details screen).
- **Channels** — user profile pages with paginated uploads (`/uploads-by-user/<id>/`).
- **Comments** — via the site's `template.ajax_comments.php` endpoint (the old parser built results but returned a broken placeholder), including relative-date parsing ("wrote 69 days ago").

## Development

```bash
bun install
bunx --bun gj test       # build + 12 offline tests against captured fixtures
bunx --bun gj validate
bunx --bun gj build --sign --bump --minify   # release
```

Tests run fully offline against real captured responses in `test-fixtures/`.
