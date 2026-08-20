export interface BomDecimal {
  readonly $type: 'decimal';
  readonly value: string;
  readonly unit?: string;
}

export interface BomInteger {
  readonly $type: 'integer';
  readonly value: string;
}

export type BomValue =
  | null
  | boolean
  | number
  | string
  | BomInteger
  | BomDecimal
  | readonly BomValue[]
  | { readonly [key: string]: BomValue };

export type BomFields = Readonly<Record<string, BomValue>>;

export type BomSafeContext = Readonly<Record<string, BomValue>>;
