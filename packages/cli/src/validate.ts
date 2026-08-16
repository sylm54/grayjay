/**
 * gj validate: check the config, the built bundle, and (if signed) the
 * signature. Also cross-checks hardcoded hostnames in the bundle against
 * allowUrls so requests don't get silently blocked at runtime.
 */

import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import type { SourcePluginConfig } from "@grayjay/config";
import { validateConfig } from "@grayjay/config";
import { verifyScript } from "@grayjay/sign";
import { isUrlAllowed } from "@grayjay/tester";
import { loadConfigFile, pluginFileStem } from "./config-loader.js";

export { isUrlAllowed };

export interface ValidateReport {
  ok: boolean;
  problems: string[];
  warnings: string[];
}

export async function validate(options: { configPath?: string; dist?: string } = {}): Promise<ValidateReport> {
  const problems: string[] = [];
  const warnings: string[] = [];
  const { path: configPath, config } = await loadConfigFile(options.configPath);

  const validation = validateConfig(config);
  problems.push(...validation.errors.map((e) => `config ${e.path || "(root)"}: ${e.message}`));
  warnings.push(...validation.warnings.map((w) => `config ${w.path || "(root)"}: ${w.message}`));

  const projectRoot = resolve(configPath, "..");
  const stem = pluginFileStem(config.name);
  const distDir = options.dist ? resolve(options.dist) : join(projectRoot, "dist");
  const scriptPath = join(distDir, `${stem}Script.js`);
  const distConfigPath = join(distDir, `${stem}Config.json`);

  if (!existsSync(scriptPath)) {
    problems.push(`missing build output ${scriptPath} — run gj build`);
    return { ok: false, problems, warnings };
  }
  const script = await readFile(scriptPath, "utf8");

  if (/\beval\s*\(/.test(script) || /\bnew\s+Function\s*\(/.test(script)) {
    if (!config.allowEval) problems.push("bundle uses eval/new Function but allowEval is false (app will crash)");
  }
  if (script.includes("import(")) {
    problems.push("bundle contains dynamic import() — the engine cannot execute it");
  }
  if (/^\s*(import|export)\s/m.test(script)) {
    problems.push("bundle appears to contain ES module syntax — expected a single classic script (IIFE)");
  }

  // Hardcoded hosts vs allowUrls (best effort; dynamic urls can't be caught).
  const allowUrls = config.allowUrls ?? [];
  if (allowUrls.length && !allowUrls.includes("everywhere")) {
    const hosts = new Set<string>();
    for (const match of script.matchAll(/https?:\/\/([a-z0-9.-]+)\//gi)) {
      hosts.add(match[1]!.toLowerCase());
    }
    for (const host of hosts) {
      if (!isUrlAllowed(`https://${host}/`, allowUrls)) {
        warnings.push(`bundle references https://${host}/ which is not in allowUrls — requests will be blocked`);
      }
    }
  }

  if (existsSync(distConfigPath)) {
    const distConfig = JSON.parse(await readFile(distConfigPath, "utf8")) as SourcePluginConfig;
    if (distConfig.version !== config.version) {
      warnings.push(
        `dist config is v${distConfig.version} but source config is v${config.version} — rebuild before publishing`,
      );
    }
    let distSignatureVerified = false;
    if (distConfig.scriptSignature && distConfig.scriptPublicKey) {
      const distScript = await readFile(scriptPath, "utf8");
      if (!verifyScript(distScript, distConfig.scriptSignature, distConfig.scriptPublicKey)) {
        problems.push(`signature in ${basename(distConfigPath)} does not verify against ${basename(scriptPath)}`);
      } else {
        distSignatureVerified = true;
      }
    } else {
      warnings.push("dist config is unsigned — users will see a security warning on install");
    }
    if (distSignatureVerified) {
      // The source config never carries a signature (it is injected at build);
      // drop the misleading "unsigned" source warning when the dist IS signed.
      const idx = warnings.findIndex((w) => w.includes("unsigned plugin"));
      if (idx >= 0) warnings.splice(idx, 1);
    }
  }

  return { ok: problems.length === 0, problems, warnings };
}
