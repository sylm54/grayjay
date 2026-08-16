/**
 * Desktop Grayjay.Engine integration for `gj test --desktop`.
 *
 * Clones the official desktop engine (ClearScript V8, the same source.js
 * contract as the Android app) into .grayjay/engine, scaffolds a tiny console
 * harness that loads the built plugin via GrayjayPlugin.FromFiles, and runs
 * plugin methods through the real engine. Requires the dotnet SDK (net8.0).
 *
 * The engine's csproj references a sibling JustCef checkout for the (Android-
 * restricted) "Browser" package; JustCef pulls in native CEF binaries, so the
 * harness patches the clone to drop that reference and stub PackageBrowser —
 * the stub only needs to compile: Release builds never instantiate "Browser"
 * for non-official plugins anyway.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build, type BuildOptions } from "./build.js";
import { loadConfigFile, pluginFileStem } from "./config-loader.js";

const ENGINE_REPO = "https://gitlab.futo.org/videostreaming/Grayjay.Engine.git";

const PACKAGE_BROWSER_STUB = `using Microsoft.ClearScript.V8;

namespace Grayjay.Engine.Packages
{
    // Stubbed by the gj desktop test harness: the real PackageBrowser needs
    // JustCef (native CEF), which is not required for testing plugins.
    public sealed class PackageBrowser : Package
    {
        public override string Name => "Browser";
        public override string VariableName => "browser";

        public PackageBrowser(GrayjayPlugin plugin) : base(plugin) { }

        public override void Initialize(V8ScriptEngine engine)
            => throw new System.InvalidOperationException(
                "The Browser package is not available in the gj desktop test harness (JustCef/CEF not included).");

        public override void Dispose() { }
    }
}
`;

function run(command: string, args: string[], options: { cwd?: string } = {}): Promise<{ code: number; output: string }> {
  return new Promise((resolvePromise, reject) => {
    const child: ChildProcess = spawn(command, args, {
      cwd: options.cwd,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout?.on("data", (d) => (output += d.toString()));
    child.stderr?.on("data", (d) => (output += d.toString()));
    child.on("error", reject);
    child.on("exit", (code) => resolvePromise({ code: code ?? 1, output }));
  });
}

async function hasDotnet(): Promise<boolean> {
  const { code } = await run("dotnet", ["--version"]).catch(() => ({ code: 1, output: "" }));
  return code === 0;
}

async function ensureEngine(engineRoot: string): Promise<string> {
  const engineDir = join(engineRoot, "Grayjay.Engine");
  const engineCsproj = join(engineDir, "Grayjay.Engine", "Grayjay.Engine.csproj");
  if (!existsSync(engineCsproj)) {
    await mkdir(engineRoot, { recursive: true });
    console.log(`⬇ cloning Grayjay.Engine (first --desktop run only)…`);
    const clone = await run("git", ["clone", "--depth", "1", ENGINE_REPO, engineDir]);
    if (clone.code !== 0) throw new Error(`cloning Grayjay.Engine failed:\n${clone.output}`);
  }

  // Patch: drop the JustCef ProjectReference (native CEF) and stub the only
  // file using it. Idempotent — re-applies cleanly if upstream changes.
  const csproj = await Bun.file(engineCsproj).text();
  if (csproj.includes("JustCef")) {
    const patched = csproj
      .split("\n")
      .filter((line) => !line.includes("JustCef"))
      .join("\n");
    await Bun.write(engineCsproj, patched);
    await Bun.write(join(engineDir, "Grayjay.Engine", "Packages", "PackageBrowser.cs"), PACKAGE_BROWSER_STUB);
    console.log(`🔧 patched engine clone: JustCef reference removed, PackageBrowser stubbed`);
  }
  return engineCsproj;
}

const HARNESS_CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <AssemblyName>GrayjayDesktopHarness</AssemblyName>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.ClearScript.V8.Native.win-x64" Version="7.4.5" />
    <PackageReference Include="Microsoft.ClearScript.V8.Native.linux-x64" Version="7.4.5" />
    <PackageReference Include="Microsoft.ClearScript.V8.Native.linux-arm64" Version="7.4.5" />
    <PackageReference Include="Microsoft.ClearScript.V8.Native.osx-x64" Version="7.4.5" />
    <PackageReference Include="Microsoft.ClearScript.V8.Native.osx-arm64" Version="7.4.5" />
    <PackageReference Include="Newtonsoft.Json" Version="13.0.3" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="__ENGINE_CSPROJ__" />
  </ItemGroup>
</Project>
`;

const HARNESS_PROGRAM = `using Grayjay.Engine;
using Grayjay.Engine.Pagers;
using Newtonsoft.Json;

if (args.Length < 3)
{
    Console.Error.WriteLine("usage: <configPath> <scriptPath> <method> [param] [--pages N]");
    return 2;
}
string configPath = args[0];
string scriptPath = args[1];
string method = args[2].ToLowerInvariant();
string? param = args.Length > 3 ? args[3] : null;
int pages = 1;
for (int i = 0; i < args.Length - 1; i++)
    if (args[i] == "--pages" && int.TryParse(args[i + 1], out var p)) pages = Math.Max(1, p);

using var plugin = GrayjayPlugin.FromFiles(configPath, scriptPath);
plugin.OnLog += (cfg, line) => Console.Error.WriteLine($"[plugin:{cfg.Name}] {line}");
plugin.Initialize();
plugin.Enable();
Console.Error.WriteLine($"[harness] {plugin.Config.Name} v{plugin.Config.Version} initialized + enabled");

object SerializePager<T>(IPager<T> pager)
{
    var allResults = new List<object>();
    allResults.AddRange(pager.GetResults().Take(5).Cast<object>());
    bool hasMore = pager.HasMorePages();
    int fetched = 1;
    while (hasMore && fetched < pages)
    {
        pager.NextPage();
        allResults.AddRange(pager.GetResults().Take(5).Cast<object>());
        hasMore = pager.HasMorePages();
        fetched++;
    }
    return new { hasMore, pages = fetched, results = allResults };
}

try
{
    object result = method switch
    {
        "home" => SerializePager(plugin.GetHome()),
        "search" when param != null => SerializePager(plugin.Search(param)),
        "search-channels" when param != null => SerializePager(plugin.SearchChannels(param)),
        "suggestions" when param != null => plugin.SearchSuggestions(param),
        "channel" when param != null => plugin.GetChannel(param),
        "channel-contents" when param != null => SerializePager(plugin.GetChannelContents(param)),
        "details" when param != null => plugin.GetContentDetails(param),
        "comments" when param != null => SerializePager(plugin.GetComments(param)),
        "playlist" when param != null => plugin.GetPlaylist(param),
        "is-playlist-url" when param != null => plugin.IsPlaylistUrl(param),
        "is-channel-url" when param != null => plugin.IsChannelUrl(param),
        "is-content-details-url" when param != null => plugin.IsContentDetailsUrl(param),
        _ => throw new ArgumentException($"unknown method '{method}' (or missing param)")
    };
    Console.WriteLine("###JSON");
    Console.WriteLine(JsonConvert.SerializeObject(result, Formatting.Indented));
    return 0;
}
catch (Exception ex)
{
    Console.Error.WriteLine($"[harness] {method} failed: {ex.Message}");
    return 1;
}
`;

async function ensureHarness(harnessDir: string, engineCsproj: string): Promise<string> {
  const csprojPath = join(harnessDir, "GrayjayDesktopHarness.csproj");
  const programPath = join(harnessDir, "Program.cs");
  const csprojContent = HARNESS_CSPROJ.replace("__ENGINE_CSPROJ__", engineCsproj.replace(/\\/g, "\\\\"));
  const csprojCurrent = existsSync(csprojPath) ? await Bun.file(csprojPath).text() : "";
  const programCurrent = existsSync(programPath) ? await Bun.file(programPath).text() : "";
  if (csprojCurrent !== csprojContent || programCurrent !== HARNESS_PROGRAM) {
    await mkdir(harnessDir, { recursive: true });
    await Bun.write(csprojPath, csprojContent);
    await Bun.write(programPath, HARNESS_PROGRAM);
  }
  return csprojPath;
}

export interface DesktopTestOptions extends BuildOptions {
  desktopMethod?: string;
  desktopParam?: string;
}

export async function runDesktopTests(options: DesktopTestOptions = {}): Promise<number> {
  if (!(await hasDotnet())) {
    console.error(
      "✗ `gj test --desktop` needs the .NET SDK (net8.0). Install it from https://dotnet.microsoft.com/download\n" +
        "  (bun tests without --desktop run without it).",
    );
    return 1;
  }

  const built = await build({ ...options, quiet: false });
  const { config } = await loadConfigFile(options.configPath);
  const stem = pluginFileStem(config.name);
  const projectRoot = resolve(built.configPath, "..");
  const engineRoot = join(projectRoot, ".grayjay", "engine");
  const harnessDir = join(projectRoot, ".grayjay", "desktop-harness");

  const engineCsproj = await ensureEngine(engineRoot);
  const harnessCsproj = await ensureHarness(harnessDir, engineCsproj);

  const method = options.desktopMethod ?? "home";
  const methodArgs =
    options.desktopParam !== undefined ? [method, options.desktopParam] : [method];
  const child = spawn("dotnet", ["run", "--project", harnessCsproj, "--", built.configJsonPath, built.scriptPath, ...methodArgs, "--pages", "2"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return await new Promise<number>((resolvePromise, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolvePromise(code ?? 1));
  });
}
