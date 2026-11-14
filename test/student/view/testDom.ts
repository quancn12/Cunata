/// <reference lib="dom" />

import {
  MockDocument,
  MockElement,
  MockEvent,
  MockKeyboardEvent,
  MockCompositionEvent,
  MockTextNode,
  MockNode,
} from "../../ui/core/dom-mock.ts";

export {
  MockEvent,
  MockKeyboardEvent,
  MockCompositionEvent,
  MockTextNode,
  MockNode,
};

export class EnhancedMockElement extends MockElement {
  public checked: boolean = false;

  scrollIntoView(_options?: unknown): void {
    // Stub for scrollIntoView
  }

  querySelector<T extends MockElement>(selector: string): T | null {
    const all = this.querySelectorAll<T>(selector);
    return all[0] ?? null;
  }

  querySelectorAll<T extends MockElement>(selector: string): T[] {
    const results: T[] = [];

    const matchesSingle = (el: MockElement, sel: string): boolean => {
      let current = sel.trim();
      if (!current) return false;

      // Check tag name if present
      const tagMatch = current.match(/^([a-zA-Z0-9]+)/);
      if (tagMatch) {
        const expectedTag = tagMatch[1]!.toUpperCase();
        if (el.tagName !== expectedTag) return false;
        current = current.slice(tagMatch[1]!.length);
      }

      // Check remaining tokens
      while (current.length > 0) {
        if (current.startsWith("#")) {
          const m = current.match(/^#([a-zA-Z0-9_-]+)/);
          if (!m || el.id !== m[1]) return false;
          current = current.slice(m[0].length);
        } else if (current.startsWith(".")) {
          const m = current.match(/^\.([a-zA-Z0-9_-]+)/);
          if (!m || !el.classList.contains(m[1]!)) return false;
          current = current.slice(m[0].length);
        } else if (current.startsWith("[")) {
          const m = current.match(/^\[([a-zA-Z0-9_-]+)(?:=([^\],]+))?\]/);
          if (!m) return false;
          const attrName = m[1]!.toLowerCase();
          const attrVal = m[2] ? m[2].replace(/^["']|["']$/g, "") : null;
          if (attrVal === null) {
            if (!el.hasAttribute(attrName)) return false;
          } else {
            if (el.getAttribute(attrName) !== attrVal) return false;
          }
          current = current.slice(m[0].length);
        } else if (current.startsWith(":not(")) {
          const m = current.match(/^:not\(([^)]+)\)/);
          if (!m) return false;
          if (matchesSingle(el, m[1]!)) return false;
          current = current.slice(m[0].length);
        } else {
          break;
        }
      }

      return true;
    };

    const traverse = (node: MockNode) => {
      for (const child of node.childNodes) {
        if (child instanceof MockElement) {
          const subSelectors = selector.split(",").map((s) => s.trim());
          let matched = false;
          for (const sel of subSelectors) {
            if (matchesSingle(child, sel)) {
              matched = true;
              break;
            }
          }
          if (matched) {
            results.push(child as unknown as T);
          }
          traverse(child);
        }
      }
    };

    traverse(this);
    return results;
  }
}

export class EnhancedMockDocument extends MockDocument {
  constructor() {
    super();
    this.head = new EnhancedMockElement("HEAD", this);
    this.body = new EnhancedMockElement("BODY", this);
  }

  createElement(tagName: string): EnhancedMockElement {
    const el = new EnhancedMockElement(tagName, this);
    // Add toggle to classList if not present
    if (typeof (el.classList as any).toggle !== "function") {
      (el.classList as any).toggle = function (className: string, force?: boolean): boolean {
        const has = this.contains(className);
        const shouldAdd = force !== undefined ? Boolean(force) : !has;
        if (shouldAdd) {
          this.add(className);
        } else {
          this.remove(className);
        }
        return shouldAdd;
      };
    }
    return el;
  }

  getElementById(id: string): EnhancedMockElement | null {
    const search = (node: MockNode): EnhancedMockElement | null => {
      for (const child of node.childNodes) {
        if (child instanceof MockElement) {
          if (child.id === id || child.getAttribute("id") === id) {
            return child as EnhancedMockElement;
          }
          const found = search(child);
          if (found) return found;
        }
      }
      return null;
    };

    return search(this.head) || search(this.body);
  }

  querySelector<T extends MockElement>(selector: string): T | null {
    return (this.body as EnhancedMockElement).querySelector<T>(selector);
  }

  querySelectorAll<T extends MockElement>(selector: string): T[] {
    return (this.body as EnhancedMockElement).querySelectorAll<T>(selector);
  }
}

export function createEnhancedMockDocument(): EnhancedMockDocument {
  return new EnhancedMockDocument();
}

/**
 * Mock FileReader for JSON file loading tests.
 */
export class MockFileReader {
  public onload: ((event: { target: { result: string } }) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;

  readAsText(blob: { text?: () => Promise<string>; content?: string } | unknown): void {
    setTimeout(() => {
      let content = "";
      if (blob && typeof blob === "object" && "content" in blob) {
        content = String((blob as any).content);
      } else if (typeof blob === "string") {
        content = blob;
      }
      if (this.onload) {
        this.onload({ target: { result: content } });
      }
    }, 0);
  }
}
