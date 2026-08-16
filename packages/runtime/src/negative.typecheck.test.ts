import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import { rm } from "node:fs/promises";

/**
 * Negative compile checks: each snippet must FAIL to compile. These guard the
 * end-to-end type safety story — typos and wrong types must be caught.
 */
const snippets: Array<[name: string, code: string]> = [
  ["method typo in definePlugin", `definePlugin({ getHom() { return new VideoPager([], false); } });`],
  ["wrong param type", `definePlugin({ search(q: number) { return new VideoPager([], false); } });`],
  ["bad video field type", `new PlatformVideo({ duration: "120" });`],
  ["unknown global class", `new NotARealClass();`],
  ["missing required url on source", `new VideoUrlSource({ width: 100 });`],
  ["wrong capabilities shape", `definePlugin({ getSearchCapabilities() { return { types: ["nope"] }; } });`],
];

describe("negative compile checks", () => {
  for (const [name, code] of snippets) {
    test(`rejects: ${name}`, async () => {
      const file = import.meta.dir + "/__negative_check__.ts";
      await Bun.write(file, code + "\n");
      try {
        const proc = await $`bunx tsc --noEmit -p ${import.meta.dir}/../tsconfig.json`.quiet().nothrow();
        const output = (proc.stdout.toString() ?? "") + (proc.stderr.toString() ?? "");
        expect(output).toContain("__negative_check__");
        expect(proc.exitCode).not.toBe(0);
      } finally {
        await rm(file, { force: true });
      }
    });
  }
});
