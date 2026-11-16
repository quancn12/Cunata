/// <reference lib="dom" />

export class MockClassList {
  private classes = new Set<string>();

  constructor(initial: string = '') {
    this.value = initial;
  }

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
    return Array.from(this.classes).join(' ');
  }

  set value(v: string) {
    this.classes.clear();
    for (const c of (v || '').split(/\s+/)) {
      if (c) this.classes.add(c);
    }
  }
}

export class MockNode {
  public parentNode: MockElement | null = null;
  public childNodes: MockNode[] = [];

  get firstChild(): MockNode | null {
    return this.childNodes[0] ?? null;
  }

  get lastChild(): MockNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }

  appendChild<T extends MockNode>(child: T): T {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this as unknown as MockElement;
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
}

export class MockTextNode extends MockNode {
  public textContent: string;

  constructor(text: string = '') {
    super();
    this.textContent = text;
  }
}

export class MockElement extends MockNode {
  public tagName: string;
  public id: string = '';
  public classList: MockClassList;
  public attributes = new Map<string, string>();
  public dataset: Record<string, string> = {};
  public style: Record<string, string> = {};
  public listeners = new Map<string, Function[]>();
  public ownerDocument: MockDocument;

  public type: string = 'text';
  public value: string = '';
  public required: boolean = false;
  public disabled: boolean = false;
  public placeholder: string = '';
  public htmlFor: string = '';

  constructor(tagName: string, ownerDoc: MockDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDoc;
    this.classList = new MockClassList();
  }

  get className(): string {
    return this.classList.value;
  }

  set className(val: string) {
    this.classList.value = val;
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

  set textContent(text: string) {
    this.childNodes = [];
    if (text) {
      const tn = new MockTextNode(text);
      tn.parentNode = this;
      this.childNodes.push(tn);
    }
  }

  append(...items: (MockNode | string)[]): void {
    for (const item of items) {
      if (typeof item === 'string') {
        const tn = new MockTextNode(item);
        this.appendChild(tn);
      } else if (item instanceof MockNode) {
        this.appendChild(item);
      }
    }
  }

  replaceChildren(...items: (MockNode | string)[]): void {
    this.childNodes = [];
    this.append(...items);
  }

  setAttribute(name: string, value: string): void {
    const lower = name.toLowerCase();
    this.attributes.set(lower, String(value));
    if (lower === 'id') this.id = String(value);
    if (lower === 'class') this.className = String(value);
    if (lower === 'type') this.type = String(value);
    if (lower === 'value') this.value = String(value);
    if (lower === 'for') this.htmlFor = String(value);
    if (lower === 'disabled') this.disabled = true;
    if (lower.startsWith('data-')) {
      const prop = lower.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      this.dataset[prop] = String(value);
    }
  }

  getAttribute(name: string): string | null {
    const lower = name.toLowerCase();
    if (lower === 'id') return this.id || null;
    if (lower === 'class') return this.className || null;
    if (lower === 'type') return this.type || null;
    if (lower === 'value') return this.value || null;
    return this.attributes.get(lower) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name.toLowerCase());
  }

  removeAttribute(name: string): void {
    const lower = name.toLowerCase();
    this.attributes.delete(lower);
    if (lower === 'id') this.id = '';
    if (lower === 'disabled') this.disabled = false;
    if (lower.startsWith('data-')) {
      const prop = lower.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      delete this.dataset[prop];
    }
  }

  addEventListener(type: string, handler: Function): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, handler: Function): void {
    const list = this.listeners.get(type);
    if (list) {
      const idx = list.indexOf(handler);
      if (idx !== -1) {
        list.splice(idx, 1);
      }
    }
  }

  dispatchEvent(event: { type: string }): boolean {
    const list = this.listeners.get(event.type) ?? [];
    for (const h of list) {
      h(event);
    }
    return true;
  }

  click(): void {
    this.dispatchEvent({ type: 'click' });
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  showModal(): void {
    this.setAttribute('open', '');
    this.style.display = '';
  }

  close(): void {
    this.removeAttribute('open');
    this.style.display = 'none';
    this.dispatchEvent({ type: 'close' });
  }

  querySelector(selector: string): MockElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];

    const matches = (el: MockElement): boolean => {
      // #id
      if (selector.startsWith('#') && !selector.includes(' ') && !selector.includes('.')) {
        return el.id === selector.slice(1);
      }
      // .class
      if (selector.startsWith('.') && !selector.includes(' ') && !selector.includes('[')) {
        return el.classList.contains(selector.slice(1));
      }
      // tag#id
      const tagIdMatch = selector.match(/^([a-z0-9]+)#([a-z0-9_-]+)$/i);
      if (tagIdMatch && tagIdMatch[1] && tagIdMatch[2]) {
        return el.tagName.toLowerCase() === tagIdMatch[1].toLowerCase() && el.id === tagIdMatch[2];
      }
      // tag[attr="val"]
      const attrMatch = selector.match(/\[([a-z0-9_-]+)(?:="([^"]*)")?\]/i);
      if (attrMatch && attrMatch[1]) {
        const attrName = attrMatch[1];
        const attrVal = attrMatch[2];
        if (attrName.startsWith('data-')) {
          const prop = attrName.slice(5).replace(/-([a-z])/g, (_, l) => l.toUpperCase());
          return attrVal !== undefined ? el.dataset[prop] === attrVal : prop in el.dataset;
        }
        return attrVal !== undefined ? el.getAttribute(attrName) === attrVal : el.hasAttribute(attrName);
      }
      // basic tag
      if (/^[a-z0-9]+$/i.test(selector)) {
        return el.tagName.toLowerCase() === selector.toLowerCase();
      }
      // fallback matching by id, tag, or class
      return el.id === selector || el.classList.contains(selector) || el.tagName.toLowerCase() === selector.toLowerCase();
    };

    const walk = (node: MockNode) => {
      for (const child of node.childNodes) {
        if (child instanceof MockElement) {
          if (matches(child)) {
            results.push(child);
          }
          walk(child);
        }
      }
    };

    walk(this);
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

  createElementNS(_ns: string, tagName: string): MockElement {
    return new MockElement(tagName, this);
  }

  createTextNode(text: string): MockTextNode {
    return new MockTextNode(text);
  }

  getElementById(id: string): MockElement | null {
    const search = (node: MockNode): MockElement | null => {
      for (const child of node.childNodes) {
        if (child instanceof MockElement) {
          if (child.id === id) return child;
          const found = search(child);
          if (found) return found;
        }
      }
      return null;
    };
    return search(this.head) || search(this.body);
  }

  querySelector(selector: string): MockElement | null {
    return this.body.querySelector(selector) || this.head.querySelector(selector);
  }

  querySelectorAll(selector: string): MockElement[] {
    return [...this.head.querySelectorAll(selector), ...this.body.querySelectorAll(selector)];
  }
}

export function createMockDocument(): MockDocument {
  return new MockDocument();
}
