declare module "node:vm" {
  export interface Context {
    [key: string]: unknown;
  }
  export function createContext(contextObject?: object, options?: unknown): Context;
  export function runInContext(code: string, contextifiedObject: Context, options?: unknown): unknown;
}
