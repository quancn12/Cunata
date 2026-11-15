declare module "node:test" {
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
  export function before(fn: () => void | Promise<void>): void;
  export function after(fn: () => void | Promise<void>): void;
}

declare module "node:assert/strict" {
  export function deepStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
}
