import type { BomValue } from './value.js';

export type BomFieldType =
  | {
      readonly kind: 'string';
      readonly maxLength?: number;
    }
  | {
      readonly kind: 'boolean';
    }
  | {
      readonly kind: 'integer';
      readonly min?: string;
      readonly max?: string;
    }
  | {
      readonly kind: 'decimal';
      readonly maxScale?: number;
      readonly roundingMode: string;
      readonly unitFamily?: string;
    }
  | {
      readonly kind: 'date';
      readonly representation: 'iso-date';
    }
  | {
      readonly kind: 'datetime';
      readonly representation: 'iso-instant';
    }
  | {
      readonly kind: 'enum';
      readonly values: readonly string[];
    }
  | {
      readonly kind: 'json';
      readonly maxBytes: number;
    };

export interface BomFieldSchema {
  readonly fieldId: string;
  readonly path: readonly string[];
  readonly type: BomFieldType;
  readonly required: boolean;
  readonly nullable: boolean;
  readonly defaultValue?: BomValue;
}

export interface BomSchema {
  readonly schemaVersion: string;
  readonly fields: readonly BomFieldSchema[];
  readonly allowAdditionalFields: boolean;
  readonly recommendedDepth: number;
  readonly maximumDepth: number;
  readonly canonicalizationVersion: string;
  readonly contentHashAlgorithm: 'SHA-256';
}
