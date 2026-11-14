/// <reference lib="dom" />

/**
 * UI block types matching the shared product contract v2.0 and WEB-contract.md §4.
 */
export type Block =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'math'; readonly source: string; readonly format: 'latex' | 'omml'; readonly verified: boolean }
  | { readonly type: 'image'; readonly assetId: string; readonly alt: string }
  | { readonly type: 'table'; readonly rows: readonly (readonly Cell[])[] };

export interface Cell {
  readonly blocks: readonly Block[];
  readonly rowSpan: number;
  readonly colSpan: number;
}

export interface Asset {
  readonly assetId: string;
  readonly mime: string;
  readonly data: string;
  readonly alt: string;
}

export interface RenderOptions {
  readonly assets?: readonly Asset[];
  readonly assetResolver?: (assetId: string) => Asset | string | null;
  readonly document?: Document;
  readonly onImageError?: (assetId: string) => void;
}

export interface ModalOptions {
  readonly initialFocus?: HTMLElement | string | null;
  readonly returnFocusTo?: HTMLElement | null;
  readonly closeOnEscape?: boolean;
  readonly onClose?: () => void;
  readonly ariaLabel?: string;
  readonly ariaLabelledBy?: string;
  readonly document?: Document;
}

export interface ModalInstance {
  readonly close: () => void;
  readonly isOpened: () => boolean;
  readonly element: HTMLElement;
}

export interface AnnouncerOptions {
  readonly container?: HTMLElement;
  readonly document?: Document;
  readonly suppressTimerTicks?: boolean;
}

export interface StatusAnnouncer {
  readonly announce: (message: string, priority?: 'polite' | 'assertive') => void;
  readonly clear: () => void;
  readonly dispose: () => void;
  readonly getElement: () => HTMLElement;
}

export interface CompositionGuardOptions<T extends HTMLInputElement | HTMLTextAreaElement = HTMLInputElement | HTMLTextAreaElement> {
  readonly element: T;
  readonly onCommit: (value: string) => void;
  readonly onInput?: (value: string) => void;
}

export interface CompositionGuard {
  readonly isComposing: () => boolean;
  readonly dispose: () => void;
}

export type UiActions = Readonly<Record<string, (value: unknown) => void>>;

export type MountFn = (
  root: HTMLElement,
  model: unknown,
  actions: UiActions
) => () => void;
