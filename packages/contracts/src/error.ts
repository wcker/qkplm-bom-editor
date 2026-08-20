import type { BomSafeContext } from './value.js';

export type BomErrorCategory =
  | 'CONFIG'
  | 'DATA'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'ABORTED'
  | 'IO'
  | 'PLUGIN'
  | 'WORKER'
  | 'RENDER'
  | 'SECURITY_LIMIT'
  | 'INTERNAL';

export interface BomError {
  readonly code: string;
  readonly category: BomErrorCategory;
  readonly messageKey: string;
  readonly messageParams?: Readonly<Record<string, string | number>>;
  readonly recoverable: boolean;
  readonly safeContext?: BomSafeContext;
}

export type BomResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly error: BomError;
    };
