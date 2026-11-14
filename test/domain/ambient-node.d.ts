declare module "node:test" {
  export interface TestContext {
    skip(message?: string): void;
    todo(message?: string): void;
    diagnostic(message: string): void;
  }
  export type TestFn = (t: TestContext) => void | Promise<void>;
  export function describe(name: string, fn: () => void | Promise<void>): void;
  export function describe(name: string, options: unknown, fn: () => void | Promise<void>): void;
  export function it(name: string, fn: TestFn): void;
  export function it(name: string, options: unknown, fn: TestFn): void;
  export function test(name: string, fn: TestFn): void;
  export function test(name: string, options: unknown, fn: TestFn): void;
  export function suite(name: string, fn: () => void | Promise<void>): void;
  export function suite(name: string, options: unknown, fn: () => void | Promise<void>): void;
  export default test;
}

declare module "node:assert/strict" {
  export function equal(actual: unknown, expected: unknown, message?: string | Error): void;
  export function notEqual(actual: unknown, expected: unknown, message?: string | Error): void;
  export function deepEqual(actual: unknown, expected: unknown, message?: string | Error): void;
  export function notDeepEqual(actual: unknown, expected: unknown, message?: string | Error): void;
  export function ok(value: unknown, message?: string | Error): asserts value;
  export function strictEqual<T>(actual: unknown, expected: T, message?: string | Error): asserts actual is T;
  export function notStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
  export function throws(fn: () => unknown, expected?: RegExp | Function | object | Error, message?: string | Error): void;
  export function doesNotThrow(fn: () => unknown, expected?: RegExp | Function, message?: string | Error): void;
  export function doesNotThrow(fn: () => unknown, message?: string | Error): void;
  export function match(value: string, regExp: RegExp, message?: string | Error): void;
  export function rejects(asyncFn: (() => Promise<unknown>) | Promise<unknown>, error?: RegExp | Function | object | Error, message?: string | Error): Promise<void>;
  const assert: {
    (value: unknown, message?: string | Error): asserts value;
    equal(actual: unknown, expected: unknown, message?: string | Error): void;
    notEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    deepEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    notDeepEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    ok(value: unknown, message?: string | Error): asserts value;
    strictEqual<T>(actual: unknown, expected: T, message?: string | Error): asserts actual is T;
    notStrictEqual(actual: unknown, expected: unknown, message?: string | Error): void;
    throws(fn: () => unknown, expected?: RegExp | Function | object | Error, message?: string | Error): void;
    doesNotThrow(fn: () => unknown, expected?: RegExp | Function, message?: string | Error): void;
    doesNotThrow(fn: () => unknown, message?: string | Error): void;
    match(value: string, regExp: RegExp, message?: string | Error): void;
    rejects(asyncFn: (() => Promise<unknown>) | Promise<unknown>, error?: RegExp | Function | object | Error, message?: string | Error): Promise<void>;
  };
  export default assert;
}

declare module "node:fs" {
  export interface Stats {
    size: number;
    isFile(): boolean;
    isDirectory(): boolean;
  }
  export function readFileSync(path: string | number, options?: { encoding?: string | null; flag?: string } | string | null): string;
  export function writeFileSync(file: string | number, data: string | Uint8Array, options?: { encoding?: string | null; mode?: number | string; flag?: string } | string | null): void;
  export function existsSync(path: string): boolean;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): Stats;
}

declare namespace NodeJS {
  interface Process {
    cwd(): string;
    env: Record<string, string | undefined>;
  }
}
declare const process: NodeJS.Process;

declare module "node:path" {
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
  export function dirname(path: string): string;
  export function basename(path: string, ext?: string): string;
}
