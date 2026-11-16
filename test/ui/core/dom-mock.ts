/// <reference lib="dom" />

/**
 * Lightweight in-memory DOM simulation for Node unit tests.
 * Zero external dependencies, pure erasable TypeScript/JavaScript.
 */

export class MockEvent {
  public defaultPrevented: boolean = false;
  public propagationStopped: boolean = false;
  public readonly type: string;
  public readonly init: Record<string, unknown>;

  constructor(type: string, init: Record<string, unknown> = {}) {
    this.type = type;
    this.init = init;
    Object.assign(this, init);
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }

  stopPropagation(): void {
    this.propagationStopped = true;
  }
}

export class MockKeyboardEvent extends MockEvent {
  public key: string;
  public shiftKey: boolean;
  public ctrlKey: boolean;
  public altKey: boolean;
  public isComposing: boolean;

  constructor(type: string, init: Record<string, unknown> = {}) {
    super(type, init);
    this.key = String(init.key ?? '');
    this.shiftKey = Boolean(init.shiftKey);
    this.ctrlKey = Boolean(init.ctrlKey);
    this.altKey = Boolean(init.altKey);
    this.isComposing = Boolean(init.isComposing);
  }
}

export class MockCompositionEvent extends MockEvent {
  public data: string;

  constructor(type: string, init: Record<string, unknown> = {}) {
    super(type, init);
    this.data = String(init.data ?? '');
  }
}

export class MockClassList {
  private classes = new Set<string>();
  private owner: MockElement;

  constructor(owner: MockElement) {
    this.owner = owner;
  }

  add(...classNames: string[]): void {
    for (const c of classNames) {
      if (c) this.classes.add(c);
    }
  }

  remove(...classNames: string[]): void {
    for (const c of classNames) {
      this.classes.delete(c);
    }
  }

  contains(className: string): boolean {
    return this.classes.has(className);
  }

  get value(): string {
    return Array.from(this.classes).join(' ');
  }

  set value(v: string) {
    this.classes.clear();
    for (const c of v.split(/\s+/)) {
      if (c) this.classes.add(c);
    }
  }
}

export class MockNode {
  public parentNode: MockNode | null = null;
  public childNodes: MockNode[] = [];

  appendChild<T extends MockNode>(child: T): T {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild<T extends MockNode>(child: T): T {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove(): void {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  replaceChild<T extends MockNode>(newChild: T, oldChild: MockNode): T {
    const idx = this.childNodes.indexOf(oldChild);
    if (idx !== -1) {
      oldChild.parentNode = null;
      newChild.parentNode = this;
      this.childNodes[idx] = newChild;
    }
    return newChild;
  }

  get firstChild(): MockNode | null {
    return this.childNodes[0] ?? null;
  }

  get lastChild(): MockNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }
}

export class MockTextNode extends MockNode {
  public textContent: string;

  constructor(textContent: string = '') {
    super();
    this.textContent = textContent;
  }
}

export class MockElement extends MockNode {
  public tagName: string;
  public attributes = new Map<string, string>();
  public classList: MockClassList;
  public style: Record<string, string> = {};
  public listeners = new Map<string, Function[]>();
  public ownerDocument: MockDocument | null = null;

  // Form & input element properties
  public value: string = '';
  public disabled: boolean = false;
  public type: string = 'text';
  public name: string = '';
  public placeholder: string = '';
  public maxLength: number = 0;
  public src: string = '';
  public alt: string = '';
  public id: string = '';
  public onsubmit: ((e: MockEvent) => void) | null = null;
  public onerror: ((e: MockEvent) => void) | null = null;

  constructor(tagName: string, ownerDoc: MockDocument | null = null) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDoc;
    this.classList = new MockClassList(this);
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
    if (lower === 'class') {
      this.className = String(value);
    } else if (lower === 'id') {
      this.id = String(value);
    } else if (lower === 'src') {
      this.src = String(value);
    } else if (lower === 'alt') {
      this.alt = String(value);
    } else if (lower === 'type') {
      this.type = String(value);
    } else if (lower === 'value') {
      this.value = String(value);
    } else if (lower === 'disabled') {
      this.disabled = true;
    }
  }

  getAttribute(name: string): string | null {
    const lower = name.toLowerCase();
    return this.attributes.get(lower) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name.toLowerCase());
  }

  removeAttribute(name: string): void {
    const lower = name.toLowerCase();
    this.attributes.delete(lower);
    if (lower === 'disabled') {
      this.disabled = false;
    }
  }

  get textContent(): string {
    let out = '';
    for (const child of this.childNodes) {
      if (child instanceof MockTextNode) {
        out += child.textContent;
      } else if (child instanceof MockElement) {
        out += child.textContent;
      }
    }
    return out;
  }

  set textContent(val: string) {
    this.childNodes = [];
    if (val) {
      this.appendChild(new MockTextNode(val));
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

  dispatchEvent(event: MockEvent): boolean {
    const onProp = (this as any)[`on${event.type}`];
    if (typeof onProp === 'function') {
      try {
        onProp.call(this, event);
      } catch (err) {
        console.error(err);
      }
    }
    const list = this.listeners.get(event.type) || [];
    for (const fn of list) {
      fn.call(this, event);
    }
    return !event.defaultPrevented;
  }

  focus(): void {
    if (this.ownerDocument) {
      this.ownerDocument.activeElement = this;
    }
  }

  blur(): void {
    if (this.ownerDocument && this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = null;
    }
  }

  click(): void {
    this.dispatchEvent(new MockEvent('click'));
  }

  querySelector<T extends MockElement>(selector: string): T | null {
    const all = this.querySelectorAll<T>(selector);
    return all[0] ?? null;
  }

  querySelectorAll<T extends MockElement>(selector: string): T[] {
    const results: T[] = [];

    const checkSubMatch = (el: MockElement, sel: string): boolean => {
      if (sel.startsWith('.')) return el.classList.contains(sel.slice(1));
      if (sel.startsWith('#')) return el.id === sel.slice(1);
      if (sel === 'a[href]') return el.tagName === 'A' && el.hasAttribute('href');
      if (sel === 'button:not([disabled])') return el.tagName === 'BUTTON' && !el.disabled && !el.hasAttribute('disabled');
      if (sel === 'input:not([disabled]):not([type="hidden"])') return el.tagName === 'INPUT' && !el.disabled && el.type !== 'hidden';
      if (sel === 'select:not([disabled])') return el.tagName === 'SELECT' && !el.disabled;
      if (sel === 'textarea:not([disabled])') return el.tagName === 'TEXTAREA' && !el.disabled;
      if (sel === '[tabindex]:not([tabindex="-1"])') return el.hasAttribute('tabindex') && el.getAttribute('tabindex') !== '-1';
      if (sel.includes('[')) {
        const attrMatches = Array.from(sel.matchAll(/\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g));
        if (attrMatches.length > 0) {
          for (const m of attrMatches) {
            const attrName = m[1];
            const attrVal = m[2];
            if (!attrName) continue;
            if (attrVal !== undefined) {
              if (el.getAttribute(attrName) !== attrVal && el.id !== attrVal) {
                return false;
              }
            } else {
              if (!el.hasAttribute(attrName)) {
                return false;
              }
            }
          }
          return true;
        }
      }
      return el.tagName === sel.toUpperCase();
    };

    const traverse = (node: MockNode) => {
      for (const child of node.childNodes) {
        if (child instanceof MockElement) {
          const subSelectors = selector.split(',').map((s) => s.trim());
          let matched = false;
          for (const sel of subSelectors) {
            if (checkSubMatch(child, sel)) {
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

export class MockDocument {
  public head: MockElement;
  public body: MockElement;
  public activeElement: MockElement | null = null;

  constructor() {
    this.head = new MockElement('HEAD', this);
    this.body = new MockElement('BODY', this);
  }

  createElement(tagName: string): MockElement {
    return new MockElement(tagName, this);
  }

  createTextNode(text: string): MockTextNode {
    return new MockTextNode(text);
  }

  getElementById(id: string): MockElement | null {
    const search = (node: MockNode): MockElement | null => {
      for (const child of node.childNodes) {
        if (child instanceof MockElement) {
          if (child.id === id || child.getAttribute('id') === id) {
            return child;
          }
          const found = search(child);
          if (found) return found;
        }
      }
      return null;
    };

    return search(this.head) || search(this.body);
  }
}

/**
 * Creates a fresh MockDocument instance for testing.
 */
export function createMockDocument(): MockDocument {
  return new MockDocument();
}
