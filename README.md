# Grayjay Plugin DevKit

A [Bun](https://bun.sh) monorepo for developing [Grayjay](https://grayjay.app) plugins in TypeScript: **end-to-end typesafe, ergonomic, and bundled into exactly the format the Grayjay engine executes** — plus signing, testing and serving tools.

```
packages/
  runtime/   @grayjay/runtime   Ambient engine types (zero-import, zero-overhead) + clean-room polyfill
  config/    @grayjay/config   Typed plugin config: defineConfig, setting builders, validateConfig
  sign/      @grayjay/sign     RSA-2048 / SHA-512 signing, byte-compatible with the official openssl flow
  tester/    @grayjay/tester   Run built plugins under bun:test: sync http, mocks, contract assertions
  cli/       @grayjay/cli      `gj` — new / build / sign / validate / test / serve (+ --desktop engine mode)
examples/
  feed-demo/                   Fully offline example plugin proving the toolchain end to end
plugins/
  pmvhaven/                    Real-world plugin (typed rebuild of github.com/sylm54/pmvhaven)
```

The type surface mirrors the actual Android engine (`V8Plugin.kt`, `JSClient.kt`, the app's `source.js` polyfill) — not just the (sometimes outdated) docs.

## Quick start

```bash
bun install   # in this repo

# scaffold a new plugin anywhere, linking the devkit packages locally:
bun packages/cli/bin/gj.ts new ~/dev/my-plugin --link "$(pwd)"
cd ~/dev/my-plugin && bun install

bunx --bun gj test            # build + run the typed tests
bunx --bun gj serve --watch   # serve on the LAN (QR code) for the Grayjay DevServer
```

Inside this repo, try the example:

```bash
cd examples/feed-demo
bunx --bun gj build           # -> dist/FeedDemoConfig.json + FeedDemoScript.js + icon.png
bunx --bun gj test            # 13 contract tests against the built bundle
bunx --bun gj validate        # config + bundle + signature checks
bunx --bun gj build --sign --bump --minify   # a release
```

## The type-safety story

Plugin code uses the engine's globals directly — they are declared as ambient types, so **nothing is imported and nothing is bundled except your own code**:

```ts
// src/env.d.ts — one line, gives you the whole engine surface
import "@grayjay/runtime/globals";

// src/index.ts — plain plugin code, fully typed
definePlugin({
  getHome() {
    return new VideoPager([new PlatformVideo({
      id: new PlatformID("MyPlugin", id, plugin.config.id),
      name: item.title,
      author: new PlatformAuthorLink(new PlatformID("MyPlugin", authorId, plugin.config.id), authorName, url),
      uploadDate: item.publishedAt,
      duration: item.seconds,
      url: detailUrl,
      thumbnails: new Thumbnails([new Thumbnail(thumbUrl, 720)]),
      isLive: false,
    })], true, { page: 1 });
  },

  search(query, type, order, filters) {
    const resp = http.GET(`https://api.example.com/search?q=${encodeURIComponent(query)}`);
    if (!resp.isOk) throw new ScriptException(`search failed (${resp.code})`);
    return new VideoPager(parse(JSON.parse(resp.body)), false);
  },
});
```

- Typos in method names, wrong parameter or return types, wrong shapes — **compile errors**, guarded by the runtime package's own negative compile tests.
- `definePlugin` accepts exactly the methods the app calls (`getHome`, `search`, `getChannelContents`, `getComments`, playlists, live events, playback tracker, … — the full list from `JSClient.kt`). Implement what you support; the app auto-detects capabilities.
- `gj build` compiles the entry to a **single classic script** (IIFE). The engine provides all globals (`source`, `Type`, `PlatformVideo`, `http`, …) at runtime, so the bundle contains only your code. `definePlugin` itself is a ~70-byte prelude injected only when used.
- The build **rejects** `eval`/`new Function` when `allowEval` is false and any dynamic `import()` — the engine would crash on those.

## Config

`grayjay.config.ts` is typed and validated field-for-field against the app's `SourcePluginConfig` deserializer:

```ts
import { defineConfig, setting } from "@grayjay/config";

export default defineConfig({
  name: "MyPlugin",
  version: 1,
  id: "309b2e83-7ede-4af8-8ee9-822bc4647a24",   // generated once by gj new — never change it
  iconUrl: "./icon.png",
  packages: ["Http"],
  allowUrls: ["api.example.com", "example.com"], // enforced like the app (or ["everywhere"])
  sourceUrl: "https://github.com/you/repo/releases/download/release/MyPluginConfig.json",
  settings: [
    setting.header("Content"),
    setting.boolean("Include live", "Add live streams", true),
    setting.dropdown("Feed size", "Items per page", ["10", "20"], "10"),
  ],
});
```

`gj validate` checks the config schema, cross-checks hardcoded hostnames in the bundle against `allowUrls`, verifies signatures, and warns about risky-but-legal choices (unsigned, `everywhere`, `allowEval`, …) — mirroring the app's own warning screens.

## Signing

`scriptSignature`/`scriptPublicKey` work exactly like the official `sign-script.sh`: **RSA-2048, SHA-512, PKCS#1 v1.5; public key = base64 X.509 SPKI DER**. The signer's tests prove byte-for-byte equality with `openssl dgst -sha512 -sign`, and CI (and you) can verify emitted artifacts with the openssl CLI:

```bash
bunx --bun gj build --sign          # creates .grayjay/keys/default.pem on first use
bunx --bun gj build --sign --key ~/.ssh/my-plugin-key.pem
GRAYJAY_SIGNING_KEY=<base64 pem> bunx --bun gj build --sign    # CI secret style
```

> Back up `.grayjay/keys/default.pem`. The key *is* your author identity: updates signed with a different key trigger the app's "Different Author" warning.

## Testing

### Bun harness (default, offline & deterministic)

`@grayjay/tester` loads the **built bundle** into an isolated `vm` context with a faithful engine environment — the clean-room polyfill of `source.js`, the real Http package surface (synchronous, like the engine, via a SharedArrayBuffer blocking bridge), `allowUrls` enforcement, `bridge`/`utility` mocks, optional `domParser` (linkedom):

```ts
import { loadPlugin, collectPages, expectPager, expectVideo, pluginExceptionType } from "@grayjay/tester";

const env = await loadPlugin({
  config: "./grayjay.config.ts",
  script: "./dist/MyPluginScript.js",
  settings: { "Feed size": "10" },
  http: { mock: (req) => req.url.includes("/search") ? { body: searchJson } : { code: 404 } },
});

const pager = expectPager(env.source.getHome(), "VideoPager");   // asserts the wire contract
expectVideo(pager.results[0]);
expect(collectPages(pager, { maxPages: 5 })).toHaveLength(50);
expect(env.requests[0]?.url).toContain("q=");
```

Assertions are realm-safe and check what the app actually reads (`plugin_type` discriminators, field shapes) — not `instanceof`, which cannot cross vm realms.

### Desktop Grayjay.Engine (opt-in)

`gj test --desktop [method] [param]` runs the built plugin through the **official desktop engine** ([Grayjay.Engine](https://gitlab.futo.org/videostreaming/Grayjay.Engine), ClearScript V8). First run clones the engine into `.grayjay/engine` and scaffolds a small .NET harness; requires the dotnet SDK (net8.0, e.g. `winget install Microsoft.DotNet.SDK.8`).

The clone is patched to drop the engine's `JustCef` dependency (native CEF, only needed for the Android-restricted `Browser` package) — everything else builds stock. Verified against the example plugin: `details`, `search`, `suggestions`, `is-content-details-url` all return fully deserialized engine models, plugin `log()` output is surfaced, and HTTP failures map cleanly to engine exceptions.

```bash
bunx --bun gj test --desktop details https://feeddemo.test/watch/home-0-1
```

Methods: `home`, `search <query>`, `search-channels <query>`, `suggestions <query>`, `channel <url>`, `channel-contents <url>`, `details <url>`, `comments <url>`, `is-channel-url <url>`, `is-content-details-url <url>`.

### On-device (DevServer)

```bash
bunx --bun gj serve --watch
```

Prints LAN URLs + a QR code (CORS enabled). In the Grayjay app: Settings → Developer Settings → Start Server, then open `http://<phone-ip>:11337/dev` in your desktop browser and load the printed config URL.

## Releasing with a stable URL

The app polls `sourceUrl` forever, so plugin files must live at **unchanging URLs**. The included CI workflow (and the one `gj new` scaffolds) publishes every build to a **fixed `release` tag**:

```
https://github.com/<owner>/<repo>/releases/download/release/MyPluginConfig.json
```

`gh release upload release dist/* --clobber` replaces the assets while the URLs stay identical — updates flow to installed plugins without changing `sourceUrl`. Set the optional `GRAYJAY_SIGNING_KEY` secret (base64 PEM) so releases stay signed by one author key; bump `version` (or use `gj build --sign --bump`) so clients pick up the update.

## Commands

| Command | Purpose |
| --- | --- |
| `gj new <dir> [--name X] [--link <devkit>]` | Scaffold a typed plugin (config, tsconfig, tests, icon, release CI) |
| `gj build [--sign] [--bump] [--minify]` | Bundle + emit `dist/<Name>Config.json` / `<Name>Script.js` / icon |
| `gj sign [--key <pem>]` | Sign an existing dist build in place |
| `gj validate` | Config schema, bundle static checks, allowUrls cross-check, signature |
| `gj test [--no-build] [--desktop [method] [param]]` | Build + `bun test`, or run via the desktop engine |
| `gj serve [--watch] [--port]` | LAN server with QR + CORS for the DevServer, rebuild on change |

## Notes & limits

- **Verified on a real machine**: all package tests (runtime 18, config 12, sign 9 incl. openssl byte-parity, tester 16, cli 8, example 13), full build/sign/bump/validate/serve flows, openssl verification of emitted artifacts, **and** the desktop Grayjay.Engine path (clone → patch → build → run `details`/`search`/`suggestions`/`is-content-details-url` against the built plugin).
- The tester's `domParser` needs `linkedom` (`bun add -d linkedom`); `gj new` scaffolds include it via the devkit workspace. JSDOM-style scraping beyond the `DOMParser` package surface is out of scope.
- Real-network tests from the harness block the test thread (like the engine blocks V8). Serve any local test HTTP servers from a worker thread (the tester's own tests show how).

## License

MIT for this repository's own code. Grayjay, its engine and docs are FUTO projects — this toolkit is an independent development aid and ships none of their code (the polyfill is a clean-room reimplementation of the documented contract).
