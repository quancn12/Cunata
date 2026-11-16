/// <reference lib="dom" />

/**
 * Lightweight, zero-dependency in-memory DOM simulation for Teacher View tests.
 * Fully typed and supports inputs, selects, textareas, composition events, and query selectors.
 */

export class TestDOMEvent {
  public defaultPrevented: boolean = false;
  public propagationStopped: boolean = false;
  public target: TestDOMElement | null = null;
  public readonly type: string;

  constructor(type: string, init: Record<string, unknown> = {}) {
    this.type = type;
    Object.assign(this, init);
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }

  stopPropagation(): void {
    this.propagationStopped = true;
  }
}

export class TestKeyboardEvent extends TestDOMEvent {
  public key: string = "";
  public isComposing: boolean = false;

  constructor(type: string, init: Record<string, unknown> = {}) {
    super(type, init);
    this.key = String(init.key ?? "");
    this.isComposing = Boolean(init.isComposing);
  }
}

export class TestClassList {
  private classes = new Set<string>();

  add(...names: string[]): void {
    for (const n of names) {
      if (n) this.classes.add(n);
    }
  }

  remove(...names: string[]): void {
    for (const n of names) {
      this.classes.delete(n);
    }
  }

  contains(name: string): boolean {
    return this.classes.has(name);
  }

  get value(): string {
    return Array.from(this.classes).join(" ");
  }

  set value(v: string) {
    this.classes.clear();
    for (const c of v.split(/\s+/)) {
      if (c) this.classes.add(c);
    }
  }
}

export class TestDOMNode {
  public parentNode: TestDOMNode | null = null;
  public childNodes: TestDOMNode[] = [];

  appendChild<T extends TestDOMNode>(child: T): T {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  append(...nodes: (TestDOMNode | string)[]): void {
    for (const n of nodes) {
      if (typeof n === "string") {
        this.appendChild(new TestTextNode(n));
      } else if (n) {
        this.appendChild(n);
      }
    }
  }

  removeChild<T extends TestDOMNode>(child: T): T {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }
}

export class TestTextNode extends TestDOMNode {
  public textContent: string;

  constructor(text: string = "") {
    super();
    this.textContent = text;
  }
}

export class TestDOMElement extends TestDOMNode {
  public tagName: string;
  public attributes = new Map<string, string>();
  public classList = new TestClassList();
  public style: Record<string, string> = {};
  public listeners = new Map<string, Function[]>();
  public ownerDocument: TestDocument;

  // Form properties
  public id: string = "";
  public type: string = "text";
  public name: string = "";
  public value: string = "";
  public checked: boolean = false;
  public selected: boolean = false;
  public disabled: boolean = false;
  public htmlFor: string = "";
  public rows: number = 0;
  public min: string = "";
  public step: string = "";
  public placeholder: string = "";
  public maxLength: number = 0;
  public title: string = "";

  // Event handlers
  public onclick: ((e: TestDOMEvent) => void) | null = null;
  public onchange: ((e: TestDOMEvent) => void) | null = null;
  public oninput: ((e: TestDOMEvent) => void) | null = null;

  constructor(tagName: string, ownerDoc: TestDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDoc;
  }

  get className(): string {
    return this.classList.value;
  }

  set className(val: string) {
    this.classList.value = val;
  }

  setAttribute(name: string, value: string): void {
    const lower = name.toLowerCase();
    this.attributes.set(lower, String(value));
    if (lower === "id") this.id = String(value);
    if (lower === "class") this.className = String(value);
    if (lower === "type") this.type = String(value);
    if (lower === "value") this.value = String(value);
    if (lower === "for") this.htmlFor = String(value);
    if (lower === "disabled") this.disabled = true;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name.toLowerCase()) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name.toLowerCase());
  }

  removeAttribute(name: string): void {
    const lower = name.toLowerCase();
    this.attributes.delete(lower);
    if (lower === "disabled") this.disabled = false;
  }

  get textContent(): string {
    let out = "";
    for (const child of this.childNodes) {
      if (child instanceof TestTextNode) {
        out += child.textContent;
      } else if (child instanceof TestDOMElement) {
        out += child.textContent;
      }
    }
    return out;
  }

  set textContent(val: string) {
    this.childNodes = [];
    if (val) {
      this.appendChild(new TestTextNode(val));
    }
  }

  addEventListener(event: string, fn: Function): void {
    const list = this.listeners.get(event) || [];
    list.push(fn);
    this.listeners.set(event, list);
  }

  removeEventListener(event: string, fn: Function): void {
    const list = this.listeners.get(event);
    if (list) {
      const idx = list.indexOf(fn);
      if (idx !== -1) {
        list.splice(idx, 1);
      }
    }
  }

  remove(): void {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  dispatchEvent(event: TestDOMEvent): boolean {
    event.target = this;
    const list = this.listeners.get(event.type) || [];
    for (const fn of list) {
      fn.call(this, event);
    }
    return !event.defaultPrevented;
  }

  click(): void {
    if (this.onclick) {
      const evt = new TestDOMEvent("click");
      evt.target = this;
      this.onclick(evt);
    }
    this.dispatchEvent(new TestDOMEvent("click"));
  }

  querySelector<T extends TestDOMElement>(selector: string): T | null {
    const all = this.querySelectorAll<T>(selector);
    return all[0] ?? null;
  }

  querySelectorAll<T extends TestDOMElement>(selector: string): T[] {
    const parts = selector.trim().split(/\s+/);
    if (parts.length > 1) {
      let currentSet: TestDOMElement[] = [this];
      for (const part of parts) {
        const nextSet: TestDOMElement[] = [];
        for (const el of currentSet) {
          nextSet.push(...el.querySelectorAll(part));
        }
        currentSet = nextSet;
      }
      return currentSet as unknown as T[];
    }

    const matches = (el: TestDOMElement, sel: string): boolean => {
      let s = sel;
      let tag = "";
      let cls = "";
      let attr = "";
      if (s.includes("[")) {
        const idx = s.indexOf("[");
        attr = s.slice(idx);
        s = s.slice(0, idx);
      }
      if (s.includes(".")) {
        const idx = s.indexOf(".");
        cls = s.slice(idx + 1);
        tag = s.slice(0, idx);
      } else if (s.startsWith("#")) {
        return el.id === s.slice(1);
      } else {
        tag = s;
      }

      if (tag && el.tagName !== tag.toUpperCase()) return false;
      if (cls && !el.classList.contains(cls)) return false;
      if (attr) {
        const clean = attr.slice(1, -1);
        if (clean.includes("=")) {
          const [aName, aVal] = clean.split("=");
          return el.getAttribute(aName!) === aVal!.replace(/['"]/g, "");
        }
        return el.hasAttribute(clean);
      }
      return true;
    };

    const results: T[] = [];
    const traverse = (node: TestDOMNode) => {
      for (const child of node.childNodes) {
        if (child instanceof TestDOMElement) {
          if (matches(child, selector)) {
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

export class TestDocument {
  public head: TestDOMElement;
  public body: TestDOMElement;

  constructor() {
    this.head = new TestDOMElement("HEAD", this);
    this.body = new TestDOMElement("BODY", this);
  }

  createElement(tagName: string): TestDOMElement {
    return new TestDOMElement(tagName, this);
  }

  createElementNS(_ns: string, tagName: string): TestDOMElement {
    return new TestDOMElement(tagName, this);
  }

  createTextNode(text: string): TestTextNode {
    return new TestTextNode(text);
  }

  getElementById(id: string): TestDOMElement | null {
    const search = (node: TestDOMNode): TestDOMElement | null => {
      for (const child of node.childNodes) {
        if (child instanceof TestDOMElement) {
          if (child.id === id) return child;
          const found = search(child);
          if (found) return found;
        }
      }
      return null;
    };
    return search(this.head) || search(this.body);
  }
}

export function createTestDocument(): TestDocument {
  return new TestDocument();
}
