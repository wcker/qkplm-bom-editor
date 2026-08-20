export {
  BOM_MODEL_ERROR_CODES,
  formatModelPath,
  modelError,
  type BomModelErrorCode,
  type BomModelResult,
} from './errors.js';
export {
  DEFAULT_BOM_MODEL_LIMITS,
  resolveModelLimits,
  type BomModelLimits,
} from './limits.js';
export {
  DANGEROUS_BOM_KEYS,
  compareCanonicalIntegers,
  countUnicodeCodePoints,
  decimalScale,
  deepFreezeBomValue,
  isDangerousBomKey,
  isPlainBomObject,
  isUnicodeScalarString,
  normalizeBomValue,
  validateCanonicalDecimal,
  validateCanonicalInteger,
  type NormalizeBomValueOptions,
} from './value.js';
export {
  normalizeBomSchema,
  normalizeFieldValue,
  validateBomSchema,
  type BomSchemaValidationOptions,
} from './schema.js';
export {
  normalizeBomFields,
  type NormalizeBomFieldsOptions,
} from './fields.js';
export {
  LEXICOGRAPHIC_ASCII_POSITION_CODEC_VERSION,
  comparePositionKeys,
  validatePositionKey,
} from './position.js';
export {
  createPositionKeyBetween,
  rebalancePositionKeys,
  type PositionKeyGenerationOptions,
} from './position-generation.js';
export {
  normalizeBomDocumentSnapshot,
  validateBomDocumentSnapshot,
  type BomSnapshotValidationOptions,
} from './snapshot.js';
export {
  buildBomIndexes,
  type BomBaseIndexes,
} from './indexes.js';
export {
  diffBomDocumentSnapshots,
} from './diff.js';
export type {
  BomDiffValueState,
  BomMaterialReference,
  BomSnapshotDeleteChange,
  BomSnapshotDiff,
  BomSnapshotDiffChange,
  BomSnapshotFieldChange,
  BomSnapshotInsertChange,
  BomSnapshotMaterialChange,
  BomSnapshotMoveChange,
  BomSnapshotReorderChange,
} from '@bom-editor/contracts';
export {
  canonicalSerializeBomValue,
  encodeCanonicalValue,
  type CanonicalBomValueOptions,
} from './canonical.js';
export {
  hashBomDocumentContent,
  hashBomDocumentEnvelope,
  hashBomFieldValue,
} from './hash.js';
export { sha256Hex } from './sha256.js';
export { compareUtf8, encodeUtf8, utf8ByteLength } from './utf8.js';
export {
  BOM_MATCH_ALGORITHM_VERSION,
  matchBomMaterials,
  type BomMaterialMatchCandidate,
  type BomMaterialMatchComponentScores,
  type BomMaterialMatchOptions,
  type BomMaterialMatchResult,
  type BomMaterialMatchSelection,
  type BomMaterialMatchSelectionStatus,
  type BomMaterialMatchSource,
  type BomMaterialMatchWeights,
} from './matching.js';
