/**
 * gj serve: host the built plugin over the LAN for the Grayjay DevServer
 * (http://<phone-ip>:11337/dev). Optional watch mode rebuilds on change.
 */

import { watch } from "node:fs";
import { join, relative, resolve } from "node:path";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { build, type BuildOptions } from "./build.js";
import { loadConfigFile, pluginFileStem } from "./config-loader.js";

/** The Bun HTTP server returned by `gj serve`. */
export type DevServer = ReturnType<typeof Bun.serve>;

export interface ServeOptions extends BuildOptions {
  port?: number;
  watch?: boolean;
}

function lanAddresses(): string[] {
  const result: string[] = [];
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const net of interfaces ?? []) {
      if (net.family === "IPv4" && !net.internal) result.push(net.address);
    }
  }
  return result;
}

export async function serve(options: ServeOptions = {}): Promise<DevServer> {
  const { config } = await loadConfigFile(options.configPath);
  const stem = pluginFileStem(config.name);
  const configName = `${stem}Config.json`;

  let first = true;
  const rebuild = async (reason?: string) => {
    if (reason) console.log(`\n⟳ rebuild (${reason})`);
    try {
      await build({ ...options, quiet: first ? false : true });
    } catch (err) {
      console.error(`  ✗ ${(err as Error).message}`);
    }
    first = false;
  };
  await rebuild();

  const { path: configPath } = await loadConfigFile(options.configPath);
  const projectRoot = resolve(configPath, "..");
  const distDir = options.out ? resolve(options.out) : join(projectRoot, "dist");
  const scriptName = `${stem}Script.js`;
  const iconFile = config.iconUrl && !/^https?:\/\//i.test(config.iconUrl) ? config.iconUrl.replace("./", "") : null;

  const port = options.port ?? 8686;
  const server = Bun.serve({
    port,
    async fetch(request) {
      const path = new URL(request.url).pathname.replace(/^\/+/, "");
      const cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Cache-Control": "no-store",
      };
      if (request.method === "OPTIONS") return new Response(null, { headers: cors });

      let file = distDir;
      if (path === "" || path === configName) {
        file = join(distDir, configName);
      } else if (path === scriptName) {
        file = join(distDir, scriptName);
      } else if (iconFile && path === iconFile) {
        file = join(distDir, iconFile);
      } else if (/^[\w.-]+$/.test(path) && existsSync(join(distDir, path))) {
        file = join(distDir, path);
      } else {
        return new Response("not found", { status: 404, headers: cors });
      }
      const responseFile = Bun.file(file);
      if (!(await responseFile.exists())) {
        return new Response("not found", { status: 404, headers: cors });
      }
      return new Response(responseFile, {
        headers: {
          ...cors,
          "Content-Type": file.endsWith(".json")
            ? "application/json"
            : file.endsWith(".js")
              ? "text/javascript"
              : "application/octet-stream",
        },
      });
    },
  });

  console.log(`\n🖥  Serving ${configName} from ${relative(process.cwd(), distDir) || "dist"} (CORS enabled)`);
  for (const address of lanAddresses()) {
    const url = `http://${address}:${server.port}/${configName}`;
    console.log(`\n   ${url}`);
    try {
      const qrcode = await import("qrcode-terminal");
      qrcode.default.generate(url, { small: true });
    } catch {
      // qrcode-terminal not installed; URLs above are enough.
    }
  }
  console.log(`\n📱 Load it: Grayjay app → Settings → Developer Settings → Start Server,`);
  console.log(`   then open http://<phone-ip>:11337/dev in this machine's browser and enter the URL above.`);
  console.log(`   (Or scan the QR code in the app via Add Source → QR code.)\n`);

  if (options.watch) {
    const srcDir = join(projectRoot, "src");
    const watchRoots = [srcDir, configPath].filter((p) => existsSync(p));
    let timer: ReturnType<typeof setTimeout> | undefined;
    for (const root of watchRoots) {
      watch(root, { recursive: true }, (_event, filename) => {
        if (timer) clearTimeout(timer);
        const file = typeof filename === "string" ? filename : "?";
        timer = setTimeout(() => rebuild(file), 150);
      });
    }
    console.log("👀 watching for changes (src/ and config)…\n");
  }

  return server;
}
