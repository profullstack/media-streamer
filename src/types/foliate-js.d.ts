/**
 * Type declarations for foliate-js
 *
 * foliate-js is a library for rendering ebooks in the browser
 * https://github.com/johnfactotum/foliate-js
 */

declare module 'foliate-js/view.js' {
  export class ResponseError extends Error {}
  export class NotFoundError extends Error {}
  export class UnsupportedTypeError extends Error {}

  export interface FoliateBook {
    metadata?: {
      title?: string;
      creator?: string[];
      language?: string;
      publisher?: string;
      description?: string;
    };
    toc?: FoliateTocItem[];
    sections?: { id: number; linear?: string; load?: () => Promise<unknown> }[];
    getCover?: () => Promise<Blob | null>;
    rendition?: {
      layout?: 'reflowable' | 'pre-paginated';
    };
  }

  export interface FoliateTocItem {
    label: string;
    href: string;
    subitems?: FoliateTocItem[];
  }

  export interface FoliateLocation {
    fraction?: number;
    cfi?: string;
    tocItem?: { label: string };
    range?: Range;
  }

  export function makeBook(file: File | string): Promise<FoliateBook>;

  export class View extends HTMLElement {
    book: FoliateBook;
    lastLocation: FoliateLocation | null;

    open(book: FoliateBook | File | string): Promise<void>;
    close(): void;
    goTo(target: string | number): Promise<void>;
    goToTextStart(): Promise<void>;
    next(): Promise<void>;
    prev(): Promise<void>;
    init(options?: { lastLocation?: FoliateLocation; showTextStart?: boolean }): Promise<void>;
  }
}

declare module 'foliate-js/paginator.js' {
  // Registers the foliate-paginator custom element
  export {};
}

declare module 'foliate-js/fixed-layout.js' {
  // Registers the foliate-fxl custom element
  export {};
}

declare module 'foliate-js/mobi.js' {
  export function isMOBI(file: File): Promise<boolean>;

  export class MOBI {
    constructor(options: { unzlib: (data: Uint8Array) => Uint8Array });
    open(file: File): Promise<unknown>;
  }
}
