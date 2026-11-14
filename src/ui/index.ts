/// <reference lib="dom" />

export function mount(
  root: HTMLElement,
  model: unknown,
  actions: Readonly<Record<string, (value: unknown) => void>>
): () => void {
  return () => {};
}
