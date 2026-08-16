import type { PluginSetting, SourcePluginConfig } from "./schema.js";

/**
 * `grayjay.config.ts` helper:
 *
 *   export default defineConfig({
 *     name: "MyPlugin",
 *     author: "me",
 *     id: "…uuid v4…",
 *     version: 1,
 *     allowUrls: ["api.example.com", "example.com"],
 *     packages: ["Http"],
 *     settings: [
 *       setting.header("Content"),
 *       setting.boolean("Allow mature", "Allow mature content", false),
 *       setting.dropdown("Limit", "Item limit", ["10", "20"], "10"),
 *     ],
 *   });
 *
 * `scriptUrl`/`iconUrl`/`scriptSignature`/`scriptPublicKey` are managed by
 * `gj build` — pass them only if you know why.
 */

function randomUuid(): string {
  return globalThis.crypto.randomUUID();
}

export function defineConfig(config: SourcePluginConfigInput): SourcePluginConfig {
  return { ...config };
}

export interface SourcePluginConfigInput extends Omit<Partial<SourcePluginConfig>, "name" | "version" | "id"> {
  name: string;
  version: number;
  /**
   * UUID v4 identifying your plugin forever — generate once (e.g. `gj new`
   * does it for you) and never change it; the app treats a different id as a
   * different plugin.
   */
  id: string;
}

export const setting = {
  /** Non-interactive section header. */
  header(name: string, options: { description?: string; isAdvanced?: boolean } = {}): PluginSetting {
    return { name, description: options.description ?? "", type: "Header", isAdvanced: options.isAdvanced ?? false };
  },

  boolean(
    name: string,
    description: string,
    defaultValue: boolean,
    options: { variable?: string; dependency?: string; warningDialog?: string; isAdvanced?: boolean } = {},
  ): PluginSetting {
    return {
      name,
      description,
      type: "Boolean",
      default: String(defaultValue),
      ...options,
    };
  },

  dropdown(
    name: string,
    description: string,
    options: string[],
    defaultValue: string,
    more: { variable?: string; dependency?: string; isAdvanced?: boolean } = {},
  ): PluginSetting {
    return {
      name,
      description,
      type: "Dropdown",
      options,
      default: defaultValue,
      ...more,
    };
  },

  text(
    name: string,
    description: string,
    defaultValue = "",
    options: { variable?: string; dependency?: string; warningDialog?: string; isAdvanced?: boolean } = {},
  ): PluginSetting {
    return {
      name,
      description,
      type: "String",
      default: defaultValue,
      ...options,
    };
  },
};

export { randomUuid };
