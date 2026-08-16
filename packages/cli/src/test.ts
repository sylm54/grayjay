/**
 * gj test: rebuild the plugin, then run bun:test.
 * `--desktop` runs the plugin through the desktop Grayjay.Engine instead
 * (requires the dotnet SDK; engine is cloned into .grayjay/engine).
 */

import { spawn } from "node:child_process";
import { build, type BuildOptions } from "./build.js";

export interface TestOptions extends BuildOptions {
  noBuild?: boolean;
  desktop?: boolean;
  desktopMethod?: string;
  desktopParam?: string;
  filter?: string[];
}

function runBunTest(extra: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", ["test", ...extra], { stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

export async function runTests(options: TestOptions = {}): Promise<number> {
  if (options.desktop) {
    const { runDesktopTests } = await import("./desktop.js");
    return runDesktopTests({ ...options, desktopMethod: options.desktopMethod, desktopParam: options.desktopParam });
  }

  if (!options.noBuild) {
    await build({ ...options, quiet: false });
    console.log("");
  }
  return runBunTest(options.filter ?? []);
}
