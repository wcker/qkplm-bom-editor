export interface BomModelLimits {
  readonly maxNodes: number;
  readonly maxValueDepth: number;
  readonly maxValueNodes: number;
  readonly maxAggregateBytes: number;
  readonly maxPositionKeyBytes: number;
  readonly maxIdentifierBytes: number;
  readonly maxSchemaDepth: number;
}

export const DEFAULT_BOM_MODEL_LIMITS: Readonly<BomModelLimits> = Object.freeze({
  maxNodes: 1_000_000,
  maxValueDepth: 128,
  maxValueNodes: 5_000_000,
  maxAggregateBytes: 256 * 1024 * 1024,
  maxPositionKeyBytes: 128,
  maxIdentifierBytes: 1_024,
  maxSchemaDepth: 4_096,
});

export function resolveModelLimits(
  overrides?: Partial<BomModelLimits>,
): Readonly<BomModelLimits> {
  return Object.freeze({
    ...DEFAULT_BOM_MODEL_LIMITS,
    ...overrides,
  });
}
