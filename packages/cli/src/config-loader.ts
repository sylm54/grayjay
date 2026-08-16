/** Locate and load grayjay.config.ts|.json for the current project. */

import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { SourcePluginConfig } from "@grayjay/config";

export const CONFIG_FILE_NAMES = ["grayjay.config.ts", "grayjay.config.js", "grayjay.config.json"] as const;

export interface LoadedConfigFile {
  path: string;
  config: SourcePluginConfig;
}

export function findConfigFile(root = process.cwd()): string | undefined {
  for (const name of CONFIG_FILE_NAMES) {
    const candidate = join(root, name);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

export async function loadConfigFile(path?: string): Promise<LoadedConfigFile> {
  const resolved = path ? resolve(path) : findConfigFile();
  if (!resolved) {
    throw new Error(
      `No grayjay.config.ts found in ${process.cwd()}. Create one (see \`gj new\`) or pass --config.`,
    );
  }
  let config: SourcePluginConfig | undefined;
  if (resolved.endsWith(".json")) {
    config = (await Bun.file(resolved).json()) as SourcePluginConfig;
  } else {
    const mod = (await import(pathToFileURL(resolved).href)) as {
      default?: SourcePluginConfig | { config?: SourcePluginConfig };
      config?: SourcePluginConfig;
    };
    const fromDefault = mod.default && "name" in mod.default ? mod.default : mod.default?.config;
    config = fromDefault ?? mod.config;
  }
  if (!config || typeof config !== "object" || !("name" in config)) {
    throw new Error(`${resolved} must default-export a defineConfig(...) object`);
  }
  return { path: resolved, config };
}

/** "My Cool Plugin" -> "MyCoolPlugin" (used for Config/Script file names). */
export function pluginFileStem(name: string): string {
  const stem = name.replace(/[^a-zA-Z0-9]/g, "");
  if (!stem) throw new Error(`Plugin name "${name}" contains no alphanumeric characters`);
  return stem;
}
