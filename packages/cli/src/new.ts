/**
 * gj new: scaffold a typed plugin project from the embedded template.
 */

import { mkdir, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { deflateSync } from "node:zlib";
import { randomUUID } from "node:crypto";

export interface NewOptions {
  name?: string;
  link?: string;
}

const TEMPLATE_DIR = join(import.meta.dir, "..", "templates", "plugin");

function crc32(bytes: Uint8Array): number {
  let c: number;
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBytes = Buffer.from(type, "ascii");
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBytes, Buffer.from(data)])));
  return Buffer.concat([length, typeBytes, Buffer.from(data), crcBuffer]);
}

/** Render a simple 128x128 plugin icon: rounded dark square + play triangle. */
export function makeIconPng(size = 128): Uint8Array {
  const pixels = Buffer.alloc(size * (size * 4 + 1));
  const radius = size * 0.22;
  const center = size / 2;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    pixels[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const offset = rowStart + 1 + x * 4;
      // rounded-rect coverage
      const dx = Math.max(Math.abs(x - center) - (center - radius), 0);
      const dy = Math.max(Math.abs(y - center) - (center - radius), 0);
      const inside = dx * dx + dy * dy <= radius * radius;
      if (!inside) {
        pixels[offset] = 0;
        pixels[offset + 1] = 0;
        pixels[offset + 2] = 0;
        pixels[offset + 3] = 0;
        continue;
      }
      // play triangle: point right of center-left, base left
      const ax = center - size * 0.14;
      const ay = center - size * 0.2;
      const bx = center - size * 0.14;
      const by = center + size * 0.2;
      const cx = center + size * 0.2;
      const cy = center;
      const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
      const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
      const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
      const inTriangle = d1 >= 0 && d2 >= 0 && d3 >= 0;
      if (inTriangle) {
        pixels[offset] = 255;
        pixels[offset + 1] = 255;
        pixels[offset + 2] = 255;
        pixels[offset + 3] = 255;
      } else {
        // dark indigo background
        pixels[offset] = 49;
        pixels[offset + 1] = 46;
        pixels[offset + 2] = 87;
        pixels[offset + 3] = 255;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return new Uint8Array(
    Buffer.concat([
      signature,
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", deflateSync(pixels, { level: 9 })),
      pngChunk("IEND", new Uint8Array(0)),
    ]),
  );
}

export async function scaffold(targetDir: string, options: NewOptions = {}): Promise<void> {
  const name = options.name ?? targetDir.split(/[\\/]/).pop() ?? "MyPlugin";
  if (!/^[a-zA-Z0-9 _-]+$/.test(name)) {
    throw new Error(`plugin name "${name}" may only contain letters, digits, spaces, _ and -`);
  }
  if (existsSync(targetDir) && (await readdir(targetDir)).length > 0) {
    throw new Error(`${targetDir} is not empty`);
  }

  const safeName = name.replace(/[^a-zA-Z0-9]/g, "");
  const uuid = randomUUID();
  const year = String(new Date().getFullYear());

  // Dependency versions: npm by default, local file: links with --link <dir>.
  const link = options.link ? options.link.replace(/\\/g, "/").replace(/\/+$/, "") : undefined;
  const dep = (pkg: string, path: string) => (link ? `file:${link}/${path}` : "^0.1.0");

  const replacements: Array<[RegExp, string]> = [
    [/\{\{NAME\}\}/g, name],
    [/\{\{NAME_LOWER\}\}/g, safeName.toLowerCase()],
    [/\{\{SAFE_NAME\}\}/g, safeName],
    [/\{\{UUID\}\}/g, uuid],
    [/\{\{YEAR\}\}/g, year],
    [/\{\{DEP_CLI\}\}/g, dep("@grayjay/cli", "packages/cli")],
    [/\{\{DEP_RUNTIME\}\}/g, dep("@grayjay/runtime", "packages/runtime")],
    [/\{\{DEP_TESTER\}\}/g, dep("@grayjay/tester", "packages/tester")],
    [/\{\{DEP_CONFIG\}\}/g, dep("@grayjay/config", "packages/config")],
  ];

  await copyTemplate(TEMPLATE_DIR, targetDir, replacements);
  await writeFile(join(targetDir, "icon.png"), makeIconPng());

  console.log(`✓ scaffolded ${name} in ${relative(process.cwd(), targetDir) || targetDir}`);
  console.log(`  id: ${uuid}`);
  console.log(`\nNext:`);
  console.log(`  cd ${targetDir}`);
  console.log(`  bun install`);
  console.log(`  bunx --bun gj test     # build + run tests`);
  console.log(`  bunx --bun gj serve --watch   # serve for the Grayjay DevServer`);
}

async function copyTemplate(from: string, to: string, replacements: Array<[RegExp, string]>): Promise<void> {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const sourcePath = join(from, entry.name);
    const targetPath = join(to, entry.name.replace(/\.tmpl$/, ""));
    if (entry.isDirectory()) {
      await copyTemplate(sourcePath, targetPath, replacements);
      continue;
    }
    let content = await Bun.file(sourcePath).text();
    for (const [pattern, value] of replacements) content = content.replace(pattern, value);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, content);
  }
}
