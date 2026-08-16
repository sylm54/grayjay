/**
 * @grayjay/runtime
 *
 * - Wire types (plain interfaces matching what crosses the engine bridge):
 *   `import type { PlatformVideo, VideoPager, Source } from "@grayjay/runtime"`
 * - The clean-room polyfill (classes + globals factory, used by @grayjay/tester
 *   and other tooling): `import { polyfill } from "@grayjay/runtime"`
 * - Plugin authors usually need neither: the package's `types` entry is
 *   `globals.d.ts`, so adding `"types": ["@grayjay/runtime"]` to tsconfig
 *   gives you the ambient globals (source, http, bridge, PlatformVideo, …).
 */
export * from "./types.js";
export * from "./packages.js";
export * as polyfill from "./polyfill.js";
