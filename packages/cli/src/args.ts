/** Minimal argv parser: positional commands, --flags, --key=value, --key value. */

export interface ParsedArgs {
  command: string;
  positionals: string[];
  flags: Map<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) {
        flags.set(body.slice(0, eq), body.slice(eq + 1));
      } else if (i + 1 < argv.length && !argv[i + 1]!.startsWith("-")) {
        // Only consume the next token as a value for known value-flags.
        const next = argv[i + 1]!;
        if (VALUE_FLAGS.has(body)) {
          flags.set(body, next);
          i++;
        } else {
          flags.set(body, true);
        }
      } else {
        flags.set(body, true);
      }
      continue;
    }
    if (arg.startsWith("-") && arg.length > 1) {
      flags.set(arg.slice(1), true);
      continue;
    }
    positionals.push(arg);
  }

  return { command: positionals[0] ?? "", positionals: positionals.slice(1), flags };
}

/** Flags that consume a value when given as `--flag value`. */
const VALUE_FLAGS = new Set(["key", "out", "entry", "config", "name", "port", "link", "max-pages"]);

export function flagString(flags: Map<string, string | boolean>, name: string): string | undefined {
  const value = flags.get(name);
  return typeof value === "string" ? value : undefined;
}

export function flagNumber(flags: Map<string, string | boolean>, name: string): number | undefined {
  const value = flagString(flags, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) throw new Error(`--${name} expects a number, got "${value}"`);
  return parsed;
}

export function hasFlag(flags: Map<string, string | boolean>, name: string): boolean {
  return flags.has(name);
}
