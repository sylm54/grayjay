import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { build, type BuildResult } from "./build.js";
import { validate } from "./validate.js";
import { scaffold, makeIconPng } from "./new.js";
import { generateKeyPair, verifyScript } from "@grayjay/sign";
import type { SourcePluginConfig } from "@grayjay/config";

const EXAMPLE_DIR = resolve(import.meta.dir, "../../../examples/feed-demo");
const EXAMPLE_CONFIG = join(EXAMPLE_DIR, "grayjay.config.ts");

let built: BuildResult | undefined;

describe("gj build (against examples/feed-demo)", () => {
  test("bundles to a single classic script", async () => {
    built = await build({ configPath: EXAMPLE_CONFIG, quiet: true });
    expect(built.scriptPath.endsWith("FeedDemoScript.js")).toBe(true);
    expect(existsSync(built.configJsonPath)).toBe(true);
    expect(built.scriptBytes).toBeGreaterThan(1000);

    const script = await Bun.file(built.scriptPath).text();
    // definePlugin gets a prelude implementation; output is a classic script.
    expect(script).toContain("function definePlugin(");
    expect(script).not.toMatch(/^\s*(import|export)\s/m);
    expect(script).not.toContain("import(");
  });

  test("emits a config the app can resolve", async () => {
    const emitted = JSON.parse(await Bun.file(built!.configJsonPath).text()) as SourcePluginConfig;
    expect(emitted.scriptUrl).toBe("./FeedDemoScript.js");
    expect(emitted.iconUrl).toBe("./icon.png");
    expect(emitted.name).toBe("FeedDemo");
    expect(existsSync(join(built!.outDir, "icon.png"))).toBe(true);
  });

  test("signing produces a verifiable config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gjbuild-"));
    try {
      const keyPath = join(dir, "test-key.pem");
      await writeFile(keyPath, generateKeyPair().privateKeyPem);
      const signed = await build({ configPath: EXAMPLE_CONFIG, quiet: true, sign: true, key: keyPath });
      expect(signed.signed).toBe(true);

      const emitted = JSON.parse(await Bun.file(signed.configJsonPath).text()) as SourcePluginConfig;
      expect(emitted.scriptSignature).toBeTruthy();
      expect(emitted.scriptPublicKey).toBeTruthy();
      const script = await Bun.file(signed.scriptPath).text();
      expect(verifyScript(script, emitted.scriptSignature!, emitted.scriptPublicKey!)).toBe(true);
      // Tampering must break the signature.
      expect(verifyScript(script + " ", emitted.scriptSignature!, emitted.scriptPublicKey!)).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("gj validate", () => {
  test("reports ok with warnings for the unsigned demo build", async () => {
    await build({ configPath: EXAMPLE_CONFIG, quiet: true });
    const report = await validate({ configPath: EXAMPLE_CONFIG });
    expect(report.ok).toBe(true);
    expect(report.problems).toEqual([]);
    // unsigned -> warning; also the placeholder sourceUrl host check is a warning at most
    expect(report.warnings.some((w) => w.includes("unsigned"))).toBe(true);
  });

  test("catches eval in the bundle", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gjeval-"));
    try {
      // Tiny plugin that uses eval after bundling.
      await Bun.write(join(dir, "grayjay.config.json"), JSON.stringify({
        name: "EvalDemo",
        version: 1,
        id: "12345678-1234-4123-8123-123456789012",
        scriptUrl: "./EvalDemoScript.js",
        packages: [],
        allowUrls: [],
      }));
      await Bun.write(join(dir, "src", "index.js"), 'source.getHome = () => new ContentPager([], false);\nconst x = eval("1+1");\n');
      await expect(
        build({ configPath: join(dir, "grayjay.config.json"), entry: join(dir, "src", "index.js"), quiet: true }),
      ).rejects.toThrow(/eval/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("gj new", () => {
  test("scaffolds a project with placeholders filled", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gjnew-"));
    try {
      await scaffold(join(dir, "myplug"), { name: "My Plug" });
      const root = join(dir, "myplug");
      expect(existsSync(join(root, "grayjay.config.ts"))).toBe(true);
      expect(existsSync(join(root, "src", "index.ts"))).toBe(true);
      expect(existsSync(join(root, "src", "index.test.ts"))).toBe(true);
      expect(existsSync(join(root, "src", "env.d.ts"))).toBe(true);
      expect(existsSync(join(root, ".github", "workflows", "release.yml"))).toBe(true);

      const config = await Bun.file(join(root, "grayjay.config.ts")).text();
      expect(config).not.toContain("{{NAME}}");
      expect(config).toContain('name: "My Plug"');
      expect(config).toMatch(/id: "[0-9a-f-]{36}"/);
      expect(config).toContain("MyPlugConfig.json");

      const pkg = JSON.parse(await Bun.file(join(root, "package.json")).text());
      expect(pkg.name).toBe("myplug-grayjay-plugin");

      const icon = await Bun.file(join(root, "icon.png")).arrayBuffer();
      const header = new Uint8Array(icon).slice(0, 8);
      expect(Array.from(header)).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("refuses non-empty directories", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gjnew2-"));
    try {
      await Bun.write(join(dir, "keep.txt"), "x");
      await expect(scaffold(dir)).rejects.toThrow(/not empty/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("icon generator", () => {
  test("produces a valid PNG", async () => {
    const bytes = makeIconPng(64);
    expect(bytes[0]).toBe(0x89);
    expect(bytes.slice(1, 4)).toEqual(new Uint8Array([0x50, 0x4e, 0x47]));
    // IHDR width/height
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(16)).toBe(64);
    expect(view.getUint32(20)).toBe(64);
  });
});
