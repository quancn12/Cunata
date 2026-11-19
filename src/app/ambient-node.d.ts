declare namespace NodeJS {
  interface Process {
    cwd(): string;
    env: Record<string, string | undefined>;
    platform?: string;
    argv?: string[];
    exit?: (code?: number) => never;
  }
}
declare const process: NodeJS.Process;
