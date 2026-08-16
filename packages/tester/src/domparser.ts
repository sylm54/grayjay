/**
 * DOMParser package backed by linkedom (optional peer dependency), adapted to
 * the engine's Jsoup-flavored DOMNode surface (attributes as plain objects,
 * classList as array, querySelector with CSS selectors).
 */

import type { DOMNode, DomParserPackage } from "@grayjay/runtime";

interface LinkedomLike {
  tagName?: unknown;
  childNodes?: unknown;
  firstChild?: unknown;
  lastChild?: unknown;
  parentNode?: unknown;
  attributes?: unknown;
  innerHTML?: unknown;
  outerHTML?: unknown;
  textContent?: unknown;
  getAttribute?: (name: string) => string | null;
  querySelector?: (selector: string) => unknown;
  querySelectorAll?: (selector: string) => unknown[];
  [key: string]: unknown;
}

class LinkedomNodeAdapter implements DOMNode {
  private constructor(private readonly node: LinkedomLike) {}

  static wrap(node: unknown): DOMNode | null {
    return node ? new LinkedomNodeAdapter(node as LinkedomLike) : null;
  }
  static wrapAll(nodes: unknown[]): DOMNode[] {
    return nodes.map((n) => new LinkedomNodeAdapter(n as LinkedomLike));
  }

  private str(value: unknown): string {
    return typeof value === "string" ? value : "";
  }

  get nodeType(): string {
    return this.str(this.node.tagName);
  }
  get childNodes(): DOMNode[] {
    const children = this.node.childNodes;
    if (!Array.isArray(children)) return [];
    return LinkedomNodeAdapter.wrapAll(children);
  }
  get firstChild(): DOMNode | null {
    return LinkedomNodeAdapter.wrap(this.node.firstChild);
  }
  get lastChild(): DOMNode | null {
    return LinkedomNodeAdapter.wrap(this.node.lastChild);
  }
  get parentNode(): DOMNode | null {
    return LinkedomNodeAdapter.wrap(this.node.parentNode);
  }
  get parentElement(): DOMNode | null {
    return this.parentNode;
  }
  get attributes(): Record<string, string> {
    const result: Record<string, string> = {};
    const attrs = this.node.attributes as
      | { name?: unknown; value?: unknown; [k: string]: unknown }[]
      | Record<string, string>
      | undefined;
    if (Array.isArray(attrs)) {
      for (const attr of attrs) {
        const name = typeof attr.name === "string" ? attr.name : "";
        if (name) result[name] = typeof attr.value === "string" ? attr.value : "";
      }
    } else if (attrs && typeof attrs === "object") {
      for (const [k, v] of Object.entries(attrs)) result[k] = typeof v === "string" ? v : String(v);
    }
    return result;
  }
  get innerHTML(): string {
    return this.str(this.node.innerHTML);
  }
  get outerHTML(): string {
    return this.str(this.node.outerHTML);
  }
  get textContent(): string {
    return this.str(this.node.textContent);
  }
  get tagName(): string {
    return this.str(this.node.tagName).toUpperCase();
  }
  get text(): string {
    return this.textContent;
  }
  get data(): string {
    return this.textContent;
  }
  get classList(): string[] {
    const cls = this.getAttribute("class");
    return cls ? cls.split(/\s+/).filter(Boolean) : [];
  }
  get className(): string {
    return this.getAttribute("class") ?? "";
  }

  getAttribute(key: string): string {
    const value = this.node.getAttribute?.(key);
    return value === null || value === undefined ? "" : String(value);
  }
  getElementById(id: string): DOMNode | null {
    return this.querySelector(`#${id}`);
  }
  getElementsByClassName(className: string): DOMNode[] {
    return this.querySelectorAll(`.${className}`);
  }
  getElementsByTagName(tagName: string): DOMNode[] {
    return this.querySelectorAll(tagName);
  }
  getElementsByName(name: string): DOMNode[] {
    return this.querySelectorAll(`[name="${name}"]`);
  }
  querySelector(query: string): DOMNode | null {
    return LinkedomNodeAdapter.wrap(this.node.querySelector?.(query));
  }
  querySelectorAll(query: string): DOMNode[] {
    return LinkedomNodeAdapter.wrapAll(this.node.querySelectorAll?.(query) ?? []);
  }
  dispose(): void {}
}

export async function createDomParserPackage(): Promise<DomParserPackage> {
  let linkedom: { DOMParser?: unknown; parseHTML?: unknown };
  try {
    linkedom = (await import("linkedom")) as unknown as typeof linkedom;
  } catch (err) {
    throw new Error(
      "The DOMParser package needs linkedom in the harness. Install it as a dev dependency:\n" +
        "  bun add -d linkedom\n" +
        `(import failed: ${(err as Error).message})`,
    );
  }
  const parseHTML = linkedom.parseHTML as (html: string) => LinkedomLike;
  return {
    parseFromString(html: string): DOMNode {
      const doc = parseHTML(html) as LinkedomLike & { document?: unknown };
      return LinkedomNodeAdapter.wrap(doc.document ?? doc)!;
    },
  };
}
