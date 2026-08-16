/**
 * gj build: validate config -> bundle TypeScript to a single engine-compatible
 * script (IIFE, no eval) -> emit Config.json + Script.js + icon -> optionally
 * sign and inject scriptSignature/scriptPublicKey.
 */

import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import type { SourcePluginConfig, ValidationResult } from "@grayjay/config";
import { validateConfig } from "@grayjay/config";
import { keyFromBase64, loadOrCreateKey, signScript } from "@grayjay/sign";
import { findConfigFile, loadConfigFile, pluginFileStem } from "./config-loader.js";

export interface BuildOptions {
  entry?: string;
  out?: string;
  minify?: boolean;
  sign?: boolean;
  bump?: boolean;
  key?: string;
  configPath?: string;
  /** Skip the eval/dynamic-import scan (not recommended). */
  noEvalCheck?: boolean;
  quiet?: boolean;
}

export interface BuildResult {
  configPath: string;
  config: SourcePluginConfig;
  scriptPath: string;
  configJsonPath: string;
  scriptBytes: number;
  signed: boolean;
  publicKeyFingerprint?: string;
  outDir: string;
}

const DEFINE_PLUGIN_PRELUDE =
  "function definePlugin(e){for(var k in e){source[k]=e[k];}}\n";

function fail(message: string): never {
  throw new Error(message);
}

function printValidation(result: ValidationResult, quiet?: boolean): void {
  for (const error of result.errors) console.error(`  ✗ ${error.path || "(root)"}: ${error.message}`);
  for (const warning of result.warnings) {
    if (!quiet) console.warn(`  ⚠ ${warning.path || "(root)"}: ${warning.message}`);
  }
}

async function bumpVersion(configPath: string, config: SourcePluginConfig): Promise<number> {
  const next = config.version + 1;
  if (configPath.endsWith(".json")) {
    const raw = await Bun.file(configPath).text();
    const json = JSON.parse(raw) as SourcePluginConfig;
    json.version = next;
    await writeFile(configPath, JSON.stringify(json, null, 2) + "\n");
    return next;
  }
  const raw = await Bun.file(configPath).text();
  const match = raw.match(/version\s*:\s*(\d+)/);
  if (!match) {
    fail(`--bump: could not find "version: <number>" in ${configPath}; bump it manually`);
  }
  const replaced = raw.replace(/version\s*:\s*(\d+)/, `version: ${next}`);
  await writeFile(configPath, replaced);
  return next;
}

export async function build(options: BuildOptions = {}): Promise<BuildResult> {
  const { path: configPath, config: original } = await loadConfigFile(options.configPath);
  let config = original;

  const validation = validateConfig(config);
  if (!validation.valid) {
    console.error(`Config errors in ${configPath}:`);
    printValidation(validation, options.quiet);
    fail("fix the config errors above, then rebuild");
  }
  if (!options.quiet) printValidation({ valid: true, errors: [], warnings: validation.warnings }, options.quiet);

  if (options.bump) {
    const next = await bumpVersion(configPath, config);
    config = { ...config, version: next };
    console.log(`↗ version bumped to ${next}`);
  }

  const projectRoot = resolve(configPath, "..");
  const entry = options.entry ? resolve(options.entry) : join(projectRoot, "src", "index.ts");
  if (!existsSync(entry)) fail(`entry not found: ${entry}`);
  const outDir = options.out ? resolve(options.out) : join(projectRoot, "dist");
  const stem = pluginFileStem(config.name);

  // --- bundle -----------------------------------------------------------------
  let script: string;
  try {
    const built = await Bun.build({
      entrypoints: [entry],
      format: "iife",
      target: "browser",
      minify: options.minify ?? false,
      splitting: false,
      sourcemap: "none",
    });
    if (!built.success) {
      const logs = built.logs.map((l) => String(l)).join("\n");
      fail(`bundle failed:\n${logs}`);
    }
    script = await built.outputs[0]!.text();
  } catch (err) {
    fail(`bundle failed: ${(err as Error).message}`);
  }

  // The engine evaluates one plain script: no dynamic imports, no eval
  // (unless allowEval), no ESM syntax should survive.
  if (!options.noEvalCheck) {
    if (/\beval\s*\(/.test(script)) {
      fail(
        "bundle contains eval(...) but config allowEval is not enabled. " +
          "Remove the dynamic code (or set allowEval: true and accept the security warning).",
      );
    }
    if (/\bnew\s+Function\s*\(/.test(script)) {
      fail("bundle contains new Function(...) — blocked like eval. Set allowEval: true to permit it.");
    }
    if (script.includes("import(")) {
      fail("bundle contains a dynamic import — the engine executes a single classic script.");
    }
  }

  const usesDefinePlugin = script.includes("definePlugin(");
  const finalScript = usesDefinePlugin ? DEFINE_PLUGIN_PRELUDE + script : script;

  // --- emit ---------------------------------------------------------------------
  await mkdir(outDir, { recursive: true });
  const scriptName = `${stem}Script.js`;
  const configJsonName = `${stem}Config.json`;
  const scriptPath = join(outDir, scriptName);
  await writeFile(scriptPath, finalScript);

  let emitted: SourcePluginConfig = {
    ...config,
    scriptUrl: `./${scriptName}`,
  };

  // Icon: copy local files next to the config, keep remote urls untouched.
  if (config.iconUrl && !/^https?:\/\//i.test(config.iconUrl)) {
    const iconSource = isAbsolute(config.iconUrl)
      ? config.iconUrl
      : resolve(projectRoot, config.iconUrl.replace(/^\.\//, ""));
    if (existsSync(iconSource)) {
      const iconDest = join(outDir, basename(iconSource));
      await copyFile(iconSource, iconDest);
      emitted.iconUrl = `./${basename(iconSource)}`;
    } else {
      console.warn(`  ⚠ iconUrl points to a missing file (${iconSource}) — emitted as-is`);
    }
  }

  // --- sign ----------------------------------------------------------------------
  let signed = false;
  let publicKeyFingerprint: string | undefined;
  if (options.sign) {
    const { privateKeyPem, publicKeyBase64 } = await resolveSigningKey(projectRoot, options.key);
    const signature = signScript(finalScript, privateKeyPem);
    emitted = { ...emitted, scriptSignature: signature, scriptPublicKey: publicKeyBase64 };
    publicKeyFingerprint = createHash("sha256").update(publicKeyBase64).digest("hex").slice(0, 16);
    signed = true;
  }

  const configJsonPath = join(outDir, configJsonName);
  await writeFile(configJsonPath, JSON.stringify(emitted, null, 2) + "\n");

  const scriptBytes = (await stat(scriptPath)).size;
  if (!options.quiet) {
    console.log(`✓ ${configJsonName} (v${emitted.version})`);
    console.log(`✓ ${scriptName} (${(scriptBytes / 1024).toFixed(1)} kB${usesDefinePlugin ? ", definePlugin prelude" : ""})`);
    if (emitted.iconUrl?.startsWith("./")) console.log(`✓ ${emitted.iconUrl.slice(2)}`);
    if (signed) console.log(`✓ signed (key fingerprint ${publicKeyFingerprint})`);
    console.log(`  → ${outDir}`);
  }

  return {
    configPath: findConfigFile(projectRoot) ?? configPath,
    config: emitted,
    scriptPath,
    configJsonPath,
    scriptBytes,
    signed,
    publicKeyFingerprint,
    outDir,
  };
}

async function resolveSigningKey(projectRoot: string, keyFlag?: string): Promise<{ privateKeyPem: string; publicKeyBase64: string }> {
  const envKey = process.env.GRAYJAY_SIGNING_KEY;
  if (envKey) return keyFromBase64(envKey.trim());
  if (keyFlag) return loadOrCreateKey(resolve(keyFlag));
  return loadOrCreateKey(join(projectRoot, ".grayjay", "keys", "default.pem"));
}

/** Standalone sign of an existing dist (used by `gj sign`). */
export async function signExisting(options: { key?: string; configPath?: string } = {}): Promise<void> {
  const { path: configPath, config } = await loadConfigFile(options.configPath);
  const projectRoot = resolve(configPath, "..");
  const stem = pluginFileStem(config.name);
  const outDir = join(projectRoot, "dist");
  const scriptPath = join(outDir, `${stem}Script.js`);
  if (!existsSync(scriptPath)) fail(`no built script at ${scriptPath} — run gj build first`);
  const script = await Bun.file(scriptPath).text();

  const { privateKeyPem, publicKeyBase64 } = await resolveSigningKey(projectRoot, options.key);
  const signature = signScript(script, privateKeyPem);
  const distConfigPath = join(outDir, `${stem}Config.json`);
  const distConfig = (await Bun.file(distConfigPath).json()) as SourcePluginConfig;
  await writeFile(
    distConfigPath,
    JSON.stringify({ ...distConfig, scriptSignature: signature, scriptPublicKey: publicKeyBase64 }, null, 2) + "\n",
  );
  const fingerprint = createHash("sha256").update(publicKeyBase64).digest("hex").slice(0, 16);
  console.log(`✓ signed ${basename(scriptPath)} with key ${fingerprint}`);
  console.log(`✓ updated ${basename(distConfigPath)}`);
}
