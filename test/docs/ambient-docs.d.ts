declare module "node:path" {
  export function relative(from: string, to: string): string;
}

declare module "node:vm" {
  export class Script {
    constructor(code: string);
    runInThisContext(): unknown;
  }
}

interface RegExp {
  test(string: string | undefined): boolean;
}
