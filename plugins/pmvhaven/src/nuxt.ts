/**
 * Nuxt `__NUXT_DATA__` (devalue) resolver.
 *
 * The site server-renders its data as a flat array where container values
 * (objects/arrays) hold *indices* into that array instead of nested values.
 * Wrappers like ["Reactive", idx] / ["ShallowReactive", idx] annotate
 * reactivity. `resolveNuxt` turns a payload array into plain objects.
 */

export type NuxtValue =
  | string
  | number
  | boolean
  | null
  | NuxtValue[]
  | { [key: string]: NuxtValue };

export type NuxtPayload = NuxtValue[];

/** Any resolved plain JSON value. */
export type Plain =
  | string
  | number
  | boolean
  | null
  | undefined
  | Plain[]
  | { [key: string]: Plain };

const WRAPPERS = new Set(["Reactive", "ShallowReactive", "ShallowRef", "Ref", "EmptyStringRef"]);

export function resolveNuxt(payload: NuxtPayload, index: number, seen: ReadonlySet<number> = new Set()): Plain {
  const entry = payload[index];
  if (entry === undefined) return undefined;
  return resolveValue(payload, entry, seen);
}

function resolveValue(payload: NuxtPayload, value: NuxtValue, seen: ReadonlySet<number>): Plain {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    const target = payload[value];
    // Unknown index: treat the number itself as the value.
    if (target === undefined) return value;
    // Primitive leaves are deduplicated across fields — sharing is legal, not
    // a cycle. Only container references can actually cycle.
    if (target === null || typeof target !== "object") return target;
    if (seen.has(value)) return undefined;
    return resolveValue(payload, target, new Set(seen).add(value));
  }
  if (Array.isArray(value)) {
    // Reactive wrappers: ["Reactive", idx]
    if (value.length === 2 && typeof value[0] === "string" && WRAPPERS.has(value[0])) {
      return resolveValue(payload, value[1]!, seen);
    }
    return value.map((item) => resolveValue(payload, item, seen));
  }
  const result: { [key: string]: Plain } = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = resolveValue(payload, item, seen);
  }
  return result;
}

export function asRecord(value: Plain): Record<string, Plain> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, Plain>) : undefined;
}

export function asArray(value: Plain): Plain[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: Plain): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function asNumber(value: Plain): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/** Find the page payload object by a signature set of keys. */
export function findNuxtObject(payload: NuxtPayload, requiredKeys: string[], atLeast = 2): Record<string, Plain> | undefined {
  for (const entry of payload) {
    if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
      const keys = Object.keys(entry);
      const hits = requiredKeys.filter((k) => keys.includes(k));
      if (hits.length >= atLeast) {
        const resolved = asRecord(resolveValue(payload, entry, new Set()));
        if (resolved) return resolved;
      }
    }
  }
  return undefined;
}

/** Extract and parse the __NUXT_DATA__ script from server-rendered HTML. */
export function extractNuxtPayload(html: string): NuxtPayload {
  const match = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match?.[1]) {
    throw new ScriptException("Could not find __NUXT_DATA__ in page HTML — the site layout may have changed");
  }
  return JSON.parse(match[1]) as NuxtPayload;
}
