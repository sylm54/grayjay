import { parseArgs, flagNumber, flagString, hasFlag } from "./args.js";
import { build, signExisting } from "./build.js";
import { validate } from "./validate.js";
import { serve } from "./serve.js";
import { scaffold } from "./new.js";
import { runTests } from "./test.js";

const HELP = `gj — Grayjay plugin toolchain

Usage: gj <command> [options]

Commands:
  new <dir> [--name X] [--link <devkit>]   Scaffold a typed plugin project
  build [--sign] [--bump] [--minify]       Bundle + emit dist/Config.json & Script.js
  sign [--key <pem>]                       Sign an existing dist build in place
  validate                                 Check config, bundle and signature
  test [--no-build] [--desktop [method]]   Build + bun test (or run via desktop engine)
  serve [--watch] [--port 8686]            Serve dist/ on the LAN (QR + CORS) for DevServer

Build options:
  --entry <file>     Entry file (default src/index.ts)
  --out <dir>        Output dir (default dist)
  --config <file>    Config file (default grayjay.config.ts|.json)
  --key <pem>        Signing key (default .grayjay/keys/default.pem, or GRAYJAY_SIGNING_KEY)
  --no-eval-check    Skip eval/dynamic-import scan

Signing keys are RSA-2048; signatures are SHA-512/PKCS#1 v1.5, byte-compatible
with the official sign-script.sh openssl flow.

Environment:
  GRAYJAY_SIGNING_KEY   base64 PEM used by --sign (takes precedence over --key)
  GJ_DEBUG              print stack traces
`;

export async function main(argv: string[]): Promise<void> {
  const { command, positionals, flags } = parseArgs(argv);

  switch (command) {
    case "new": {
      const dir = positionals[0];
      if (!dir) throw new Error("usage: gj new <dir> [--name X] [--link <devkit-path>]");
      await scaffold(dir, { name: flagString(flags, "name"), link: flagString(flags, "link") });
      return;
    }

    case "build": {
      await build({
        entry: flagString(flags, "entry"),
        out: flagString(flags, "out"),
        minify: hasFlag(flags, "minify"),
        sign: hasFlag(flags, "sign"),
        bump: hasFlag(flags, "bump"),
        key: flagString(flags, "key"),
        configPath: flagString(flags, "config"),
        noEvalCheck: hasFlag(flags, "no-eval-check"),
      });
      return;
    }

    case "sign": {
      await signExisting({ key: flagString(flags, "key"), configPath: flagString(flags, "config") });
      return;
    }

    case "validate": {
      const report = await validate({ configPath: flagString(flags, "config") });
      for (const problem of report.problems) console.error(`✗ ${problem}`);
      for (const warning of report.warnings) console.warn(`⚠ ${warning}`);
      if (report.ok) {
        console.log("✓ valid: config, bundle and signature check out");
      } else {
        throw new Error(`${report.problems.length} problem(s) found`);
      }
      return;
    }

    case "test": {
      const code = await runTests({
        noBuild: hasFlag(flags, "no-build"),
        desktop: hasFlag(flags, "desktop"),
        desktopMethod: positionals[0],
        desktopParam: positionals[1],
        entry: flagString(flags, "entry"),
        out: flagString(flags, "out"),
        configPath: flagString(flags, "config"),
        minify: hasFlag(flags, "minify"),
      });
      if (code !== 0) process.exit(code);
      return;
    }

    case "serve": {
      await serve({
        port: flagNumber(flags, "port"),
        watch: hasFlag(flags, "watch"),
        entry: flagString(flags, "entry"),
        out: flagString(flags, "out"),
        configPath: flagString(flags, "config"),
        minify: hasFlag(flags, "minify"),
      });
      return;
    }

    case "help":
    case "--help":
    case "-h":
    case "": {
      console.log(HELP);
      return;
    }

    default:
      throw new Error(`unknown command "${command}"\n\n${HELP}`);
  }
}
