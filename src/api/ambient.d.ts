declare module 'node:crypto' {
  export interface Hash {
    update(data: string | Uint8Array): Hash;
    digest(encoding: 'hex'): string;
    digest(): Uint8Array;
  }
  export function createHash(algorithm: string): Hash;
  export function scryptSync(
    password: string | Uint8Array,
    salt: string | Uint8Array,
    keylen: number
  ): Buffer;
  export function randomBytes(size: number): Buffer;
  export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean;
  export function randomUUID(): string;
}

declare interface Buffer extends Uint8Array {
  toString(encoding?: string): string;
  equals(other: Uint8Array): boolean;
}

declare var Buffer: {
  from(value: string | Uint8Array | ArrayLike<number>, encoding?: string): Buffer;
  isBuffer(obj: unknown): obj is Buffer;
};
