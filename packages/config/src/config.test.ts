import { describe, expect, test } from "bun:test";
import { defineConfig, setting, validateConfig } from "./index.js";

const validConfig = defineConfig({
  name: "Test",
  version: 1,
  id: "309b2e83-7ede-4af8-8ee9-822bc4647a24",
  allowUrls: ["api.test.test"],
  packages: ["Http"],
});

describe("validateConfig", () => {
  test("accepts a minimal valid config", () => {
    const result = validateConfig(validConfig);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("rejects non-object", () => {
    expect(validateConfig("nope").valid).toBe(false);
    expect(validateConfig(null).valid).toBe(false);
  });

  test("requires name, integer version, uuid v4 id", () => {
    expect(validateConfig({ ...validConfig, name: "" }).errors.map((e) => e.path)).toContain("name");
    expect(validateConfig({ ...validConfig, version: 1.5 }).errors.map((e) => e.path)).toContain("version");
    expect(validateConfig({ ...validConfig, version: 0 }).errors.map((e) => e.path)).toContain("version");
    expect(validateConfig({ ...validConfig, id: "not-a-uuid" }).errors.map((e) => e.path)).toContain("id");
    // v4 variant bits
    expect(validateConfig({ ...validConfig, id: "309b2e83-7ede-4af8-8ee9-822bc4647a24" }).valid).toBe(true);
  });

  test("flags unsigned configs as warning, not error", () => {
    const result = validateConfig(validConfig);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.path === "scriptSignature")).toBe(true);
  });

  test("half-signature is a warning", () => {
    const result = validateConfig({ ...validConfig, scriptPublicKey: "abc" });
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.path === "scriptSignature")).toBe(true);
  });

  test("warns on everywhere / allowEval / empty allowUrls", () => {
    const result = validateConfig({ ...validConfig, allowUrls: ["everywhere"], allowEval: true });
    expect(result.warnings.some((w) => w.path === "allowUrls")).toBe(true);
    expect(result.warnings.some((w) => w.path === "allowEval")).toBe(true);
  });

  test("warns when Http is requested with empty allowUrls", () => {
    const result = validateConfig({ ...validConfig, allowUrls: [] });
    expect(result.warnings.some((w) => w.path === "allowUrls")).toBe(true);
  });

  test("rejects unknown packages, warns on Browser", () => {
    const result = validateConfig({ ...validConfig, packages: ["Http", "Nope"] });
    expect(result.errors[0]!.path).toBe("packages[1]");
    const browser = validateConfig({ ...validConfig, packages: ["Browser"] });
    expect(browser.warnings.some((w) => w.path === "packages[0]")).toBe(true);
  });

  test("validates authentication.loginUrl", () => {
    expect(validateConfig({ ...validConfig, authentication: {} }).errors[0]!.path).toBe("authentication.loginUrl");
    expect(
      validateConfig({ ...validConfig, authentication: { loginUrl: "https://x.test/login" } }).valid,
    ).toBe(true);
  });

  test("validates settings", () => {
    const bad = validateConfig({
      ...validConfig,
      settings: [{ name: "", description: "", type: "Boolean" }],
    });
    expect(bad.errors[0]!.path).toBe("settings[0].name");

    const dup = validateConfig({
      ...validConfig,
      settings: [setting.boolean("A", "x", false), setting.boolean("A", "y", true)],
    });
    expect(dup.errors.some((e) => e.path === "settings[1]")).toBe(true);

    const dropdown = validateConfig({
      ...validConfig,
      settings: [setting.dropdown("D", "x", [], "1")],
    });
    expect(dropdown.errors[0]!.path).toBe("settings[0].options");
  });

  test("warns on unknown keys", () => {
    const result = validateConfig({ ...validConfig, typoKey: true } as unknown);
    expect(result.warnings.some((w) => w.path === "typoKey")).toBe(true);
  });
});

describe("setting builders", () => {
  test("produce app-compatible settings", () => {
    const settings = [
      setting.header("Content"),
      setting.boolean("Allow mature", "Allow mature content", false),
      setting.dropdown("Limit", "How many items", ["10", "20"], "10"),
    ];
    const result = validateConfig({ ...validConfig, settings });
    expect(result.valid).toBe(true);
    expect(settings[0]!.type).toBe("Header");
    expect(settings[1]!.default).toBe("false");
    expect(settings[2]!.options).toEqual(["10", "20"]);
  });
});

describe("settings JSON-parseability guard", () => {
  test("warns on non-JSON defaults (engine parseSettings crash)", () => {
    const result = validateConfig({
      ...validConfig,
      settings: [{ name: "Mode", description: "", type: "Dropdown", default: "Latest uploads", options: ["Latest uploads"] }],
    });
    expect(result.warnings.some((w) => w.path === "settings[0].default" && w.message.includes("parseSettings"))).toBe(true);
  });

  test("accepts JSON-form defaults", () => {
    const result = validateConfig({
      ...validConfig,
      settings: [
        { name: "Flag", description: "", type: "Boolean", default: "true" },
        { name: "Mode", description: "", type: "Dropdown", default: "0", options: ["A", "B"] },
      ],
    });
    expect(result.warnings.some((w) => w.path.startsWith("settings[") && w.path.endsWith(".default"))).toBe(false);
  });
});
