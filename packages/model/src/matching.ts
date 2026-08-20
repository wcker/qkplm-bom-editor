import type {
  BomDocumentSnapshot,
  BomFields,
  BomNode,
  BomValue,
  OccurrenceId,
  RevisionToken,
} from '@bom-editor/contracts';

/** Version marker for deterministic material-match scoring. */
export const BOM_MATCH_ALGORITHM_VERSION = 'bom-match/v1';

/** Source of the best scoring value for a material occurrence. */
export type BomMaterialMatchSource =
  | 'materialCode'
  | 'materialId'
  | 'alias'
  | 'field';

/** Independent bounded multipliers for source and scoring signals. */
export interface BomMaterialMatchWeights {
  readonly materialCode?: number;
  readonly materialId?: number;
  readonly alias?: number;
  readonly field?: number;
  readonly pinyin?: number;
  readonly editDistance?: number;
  /** Extra multiplier for fields explicitly marked as specifications. */
  readonly specification?: number;
}

/** Both thresholds must pass before a result can be suggested as selected. */
export interface BomMaterialMatchSelection {
  readonly minConfidence: number;
  readonly minScoreDelta: number;
}

/**
 * Host-controlled, deterministic material-match configuration. Locale
 * behavior remains injectable so it is never fixed by the generic model.
 */
export interface BomMaterialMatchOptions<TFields extends BomFields = BomFields> {
  readonly query: string;
  /** Restrict field matching to these nested field paths. */
  readonly fieldPaths?: readonly (readonly string[])[];
  /** Field-specific multipliers keyed by a dot-separated field path. */
  readonly fieldWeights?: Readonly<Record<string, number>>;
  /** Fields whose matching signals should receive the specification weight. */
  readonly specificationPaths?: readonly (readonly string[])[];
  /** Host-provided aliases keyed by stable occurrence ID. */
  readonly aliasesByOccurrenceId?: Readonly<
    Record<string, readonly string[]>
  >;
  readonly weights?: Readonly<BomMaterialMatchWeights>;
  /** Optional locale-independent transliteration hook, for example pinyin. */
  readonly pinyin?: (value: string) => string;
  /** Optional deterministic tokenizer. */
  readonly tokenizer?: (value: string) => readonly string[];
  readonly limit?: number;
  readonly selection?: Readonly<BomMaterialMatchSelection>;
}

/** Unweighted signal scores used to explain a material-match candidate. */
export interface BomMaterialMatchComponentScores {
  readonly exact: number;
  readonly prefix: number;
  readonly token: number;
  readonly pinyin: number;
  readonly editDistance: number;
  readonly specification: number;
}

/** One immutable, read-only material-match suggestion. */
export interface BomMaterialMatchCandidate {
  readonly occurrenceId: OccurrenceId;
  readonly materialCode?: string;
  readonly materialId?: string;
  readonly score: number;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly sources: readonly BomMaterialMatchSource[];
  readonly normalizedQuery: string;
  readonly normalizedCandidate: string;
  readonly componentScores: Readonly<BomMaterialMatchComponentScores>;
}

/** Selection outcome; only `selected` passed both host-provided thresholds. */
export type BomMaterialMatchSelectionStatus =
  | 'none'
  | 'selected'
  | 'ambiguous';

/** Immutable deterministic match output for one Snapshot revision. */
export interface BomMaterialMatchResult {
  readonly algorithmVersion: typeof BOM_MATCH_ALGORITHM_VERSION;
  readonly indexRevision: RevisionToken;
  readonly matches: readonly Readonly<BomMaterialMatchCandidate>[];
  readonly totalCandidates: number;
  readonly selectionStatus: BomMaterialMatchSelectionStatus;
  readonly selectedOccurrenceId?: string;
}

interface CandidateText {
  readonly normalized: string;
  readonly source: BomMaterialMatchSource;
  readonly path: string;
  readonly weight: number;
  readonly specification: boolean;
}

interface ScoredText {
  readonly text: CandidateText;
  readonly score: number;
  readonly confidence: number;
  readonly reasons: readonly string[];
  readonly components: BomMaterialMatchComponentScores;
}

const DEFAULT_WEIGHTS: Required<BomMaterialMatchWeights> = Object.freeze({
  materialCode: 1,
  materialId: 0.98,
  alias: 0.94,
  field: 0.78,
  pinyin: 0.72,
  editDistance: 0.64,
  specification: 1.08,
});
const MAX_MATCH_QUERY_LENGTH = 512;
const MAX_MATCH_COMPARISON_LENGTH = 4_096;

/**
 * Scores material occurrences without changing the Snapshot, selection, or
 * any external state. Callers decide whether to adopt a returned suggestion.
 */
export function matchBomMaterials<TFields extends BomFields = BomFields>(
  snapshot: Readonly<BomDocumentSnapshot<TFields>>,
  options: Readonly<BomMaterialMatchOptions<TFields>>,
): Readonly<BomMaterialMatchResult> {
  const query = normalizeText(options.query);
  const limit = boundedInteger(options.limit, 1, 1_000, 50);
  const weights = resolveWeights(options.weights);
  const matches: BomMaterialMatchCandidate[] = [];
  if (query.length === 0 || query.length > MAX_MATCH_QUERY_LENGTH) {
    return emptyMatchResult(snapshot.revision);
  }
  const nodes = snapshot.nodes;

  for (const node of nodes) {
    if (node.kind !== 'material') continue;
    const texts = candidateTexts(node, options, weights);
    let best: ScoredText | null = null;
    for (const text of texts) {
      const scored = scoreText(query, text, options, weights);
      if (scored === null) continue;
      if (best === null || compareScoredText(scored, best) < 0) best = scored;
    }
    if (best === null) continue;
    matches.push(Object.freeze({
      occurrenceId: node.occurrenceId,
      ...(node.materialCode === undefined ? {} : { materialCode: node.materialCode }),
      ...(node.materialId === undefined ? {} : { materialId: node.materialId }),
      score: best.score,
      confidence: best.confidence,
      reasons: Object.freeze([...best.reasons]),
      sources: Object.freeze([best.text.source]),
      normalizedQuery: query,
      normalizedCandidate: best.text.normalized,
      componentScores: Object.freeze({ ...best.components }),
    }));
  }

  matches.sort((left, right) =>
    right.score - left.score ||
    right.confidence - left.confidence ||
    compareText(left.occurrenceId, right.occurrenceId),
  );
  const first = matches[0];
  const second = matches[1];
  const selection = resolveSelection(first, second, options.selection);
  return Object.freeze({
    algorithmVersion: BOM_MATCH_ALGORITHM_VERSION,
    indexRevision: snapshot.revision,
    matches: Object.freeze(matches.slice(0, limit)),
    totalCandidates: matches.length,
    selectionStatus: selection.status,
    ...(selection.selectedOccurrenceId === undefined
      ? {}
      : { selectedOccurrenceId: selection.selectedOccurrenceId }),
  });
}

function candidateTexts<TFields extends BomFields>(
  node: Readonly<BomNode<TFields>>,
  options: Readonly<BomMaterialMatchOptions<TFields>>,
  weights: Required<BomMaterialMatchWeights>,
): readonly CandidateText[] {
  const result: CandidateText[] = [];
  const add = (
    value: string | undefined,
    source: BomMaterialMatchSource,
    path: string,
    weight: number,
    specification = false,
  ): void => {
    if (value === undefined) return;
    const normalized = normalizeText(value);
    if (normalized.length === 0) return;
    result.push(Object.freeze({
      normalized,
      source,
      path,
      weight: boundedWeight(weight),
      specification,
    }));
  };
  add(node.materialCode, 'materialCode', '$materialCode', weights.materialCode);
  add(node.materialId, 'materialId', '$materialId', weights.materialId);
  for (const alias of options.aliasesByOccurrenceId?.[node.occurrenceId] ?? []) {
    add(alias, 'alias', '$alias', weights.alias);
  }

  const selectedPaths = options.fieldPaths;
  if (selectedPaths === undefined) {
    collectValues(node.fields, [], addField);
  } else {
    for (const path of selectedPaths) {
      const value = readPath(node.fields, path);
      collectValues(value, path, addField);
    }
  }
  return Object.freeze(result);

  function addField(value: string, path: readonly string[]): void {
    const key = path.join('.');
    const fieldWeight = options.fieldWeights?.[key] ?? weights.field;
    const specification = isSpecificationPath(path, options.specificationPaths);
    add(value, 'field', key, fieldWeight, specification);
  }
}

function collectValues(
  value: BomValue | undefined,
  path: readonly string[],
  addField: (value: string, path: readonly string[]) => void,
): void {
  if (value === undefined || value === null) return;
  if (typeof value === 'string') {
    addField(value, path);
    return;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    addField(String(value), path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectValues(entry, [...path, String(index)], addField));
    return;
  }
  if ('$type' in value && typeof value['value'] === 'string') {
    addField(value['value'], path);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    collectValues(entry, [...path, key], addField);
  }
}

function readPath(value: BomFields, path: readonly string[]): BomValue | undefined {
  let current: BomValue = value;
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isSafeInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index]!;
    } else {
      const record = current as Readonly<Record<string, BomValue>>;
      if (!(segment in record)) return undefined;
      current = record[segment]!;
    }
  }
  return current;
}

function scoreText(
  query: string,
  text: CandidateText,
  options: Readonly<BomMaterialMatchOptions>,
  weights: Required<BomMaterialMatchWeights>,
): ScoredText | null {
  const candidate = text.normalized.slice(0, MAX_MATCH_COMPARISON_LENGTH);
  const exact = query === candidate ? 1 : 0;
  const prefix = candidate.startsWith(query) ?
    Math.min(1, query.length / Math.max(query.length, candidate.length)) : 0;
  const queryTokens = tokenize(query, options.tokenizer);
  const candidateTokens = tokenize(candidate, options.tokenizer);
  const token = tokenOverlap(queryTokens, candidateTokens);
  const pinyin = scorePinyin(query, candidate, options.pinyin);
  const editDistance = editSimilarity(query, candidate);
  const specification = text.specification ? Math.max(token, editDistance) : 0;
  const components: BomMaterialMatchComponentScores = {
    exact,
    prefix,
    token,
    pinyin,
    editDistance,
    specification,
  };
  const weighted = [
    { value: exact, weight: text.weight, reason: reasonFor(text, 'exact') },
    { value: prefix, weight: text.weight * 0.85, reason: reasonFor(text, 'prefix') },
    { value: token, weight: text.weight * 0.72, reason: reasonFor(text, 'token') },
    { value: pinyin, weight: text.weight * weights.pinyin, reason: reasonFor(text, 'pinyin') },
    { value: editDistance, weight: text.weight * weights.editDistance, reason: reasonFor(text, 'edit-distance') },
    { value: specification, weight: text.weight * weights.specification, reason: reasonFor(text, 'specification') },
  ];
  // A zero host weight disables a signal completely, including its reason and
  // its ability to create an otherwise empty candidate.
  const positive = weighted.filter((entry) =>
    entry.value > 0 && entry.weight > 0,
  );
  if (positive.length === 0) return null;
  const score = Math.min(1, Math.max(...positive.map((entry) => entry.value * entry.weight)));
  const bestSignal = Math.max(...positive.map((entry) => entry.value * entry.weight));
  const reasons = positive
    .filter((entry) => entry.value * entry.weight >= bestSignal - 0.000001)
    .map((entry) => entry.reason);
  const confidence = exact === 1
    ? 1
    : Math.min(1, Math.max(0, score * (0.85 + 0.15 * positive.length / weighted.length)));
  return Object.freeze({
    text,
    score,
    confidence,
    reasons: Object.freeze([...new Set(reasons)].sort()),
    components,
  });
}

function reasonFor(text: CandidateText, signal: string): string {
  return text.source === 'field'
    ? `field:${text.path}:${signal}`
    : `${text.source}:${signal}`;
}

function scorePinyin(
  query: string,
  candidate: string,
  pinyin: ((value: string) => string) | undefined,
): number {
  if (pinyin === undefined) return 0;
  try {
    const queryPinyin = normalizeText(pinyin(query));
    const candidatePinyin = normalizeText(pinyin(candidate));
    if (queryPinyin.length === 0 || candidatePinyin.length === 0) return 0;
    if (queryPinyin === candidatePinyin) return 1;
    return candidatePinyin.startsWith(queryPinyin)
      ? Math.min(1, queryPinyin.length / candidatePinyin.length)
      : 0;
  } catch {
    return 0;
  }
}

function tokenize(
  value: string,
  tokenizer: ((value: string) => readonly string[]) | undefined,
): readonly string[] {
  try {
    const tokens = tokenizer?.(value) ?? defaultTokenizer(value);
    return Object.freeze([...new Set(tokens
      .map((token) => normalizeText(token))
      .filter((token) => token.length > 0))]);
  } catch {
    return Object.freeze([]);
  }
}

function defaultTokenizer(value: string): readonly string[] {
  const chunks = value.match(/[\p{L}\p{N}]+/gu) ?? [];
  const result: string[] = [];
  for (const chunk of chunks) {
    if (/^[\p{Script=Han}]+$/u.test(chunk)) {
      result.push(...Array.from(chunk));
    } else {
      result.push(chunk);
    }
  }
  return result;
}

function tokenOverlap(query: readonly string[], candidate: readonly string[]): number {
  if (query.length === 0 || candidate.length === 0) return 0;
  const candidateSet = new Set(candidate);
  let matched = 0;
  for (const token of query) if (candidateSet.has(token)) matched += 1;
  return matched / query.length;
}

function editSimilarity(left: string, right: string): number {
  const leftChars = Array.from(left);
  const rightChars = Array.from(right);
  const maxLength = Math.max(leftChars.length, rightChars.length);
  if (maxLength === 0) return 0;
  if (maxLength > 256) return 0;
  let previous = Array.from({ length: rightChars.length + 1 }, (_, index) => index);
  for (let i = 1; i <= leftChars.length; i += 1) {
    const current = [i];
    let rowMinimum = i;
    for (let j = 1; j <= rightChars.length; j += 1) {
      const cost = leftChars[i - 1] === rightChars[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + cost,
      );
      current[j] = value;
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > Math.ceil(maxLength * 0.6)) return 0;
    previous = current;
  }
  return Math.max(0, 1 - previous[rightChars.length]! / maxLength);
}

function compareScoredText(left: ScoredText, right: ScoredText): number {
  return right.score - left.score ||
    right.confidence - left.confidence ||
    compareText(left.text.normalized, right.text.normalized) ||
    compareText(left.text.path, right.text.path);
}

function isSpecificationPath(
  path: readonly string[],
  specificationPaths: readonly (readonly string[])[] | undefined,
): boolean {
  return specificationPaths?.some((candidate) =>
    candidate.length === path.length &&
    candidate.every((segment, index) => segment === path[index]),
  ) ?? false;
}

function emptyMatchResult(
  indexRevision: RevisionToken,
): Readonly<BomMaterialMatchResult> {
  return Object.freeze({
    algorithmVersion: BOM_MATCH_ALGORITHM_VERSION,
    indexRevision,
    matches: Object.freeze([]),
    totalCandidates: 0,
    selectionStatus: 'none',
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function resolveSelection(
  first: BomMaterialMatchCandidate | undefined,
  second: BomMaterialMatchCandidate | undefined,
  selection: Readonly<BomMaterialMatchSelection> | undefined,
): Readonly<{
  readonly status: BomMaterialMatchSelectionStatus;
  readonly selectedOccurrenceId?: string;
}> {
  if (first === undefined) return Object.freeze({ status: 'none' });
  if (selection === undefined) return Object.freeze({ status: 'ambiguous' });
  const minConfidence = boundedUnit(selection.minConfidence, 0.8);
  const minScoreDelta = boundedUnit(selection.minScoreDelta, 0.1);
  const delta = second === undefined ? first.score : first.score - second.score;
  return first.confidence >= minConfidence && delta >= minScoreDelta
    ? Object.freeze({ status: 'selected', selectedOccurrenceId: first.occurrenceId })
    : Object.freeze({ status: 'ambiguous' });
}

function resolveWeights(
  input: Readonly<BomMaterialMatchWeights> | undefined,
): Required<BomMaterialMatchWeights> {
  const source = input ?? {};
  return {
    materialCode: boundedWeight(source.materialCode ?? DEFAULT_WEIGHTS.materialCode),
    materialId: boundedWeight(source.materialId ?? DEFAULT_WEIGHTS.materialId),
    alias: boundedWeight(source.alias ?? DEFAULT_WEIGHTS.alias),
    field: boundedWeight(source.field ?? DEFAULT_WEIGHTS.field),
    pinyin: boundedWeight(source.pinyin ?? DEFAULT_WEIGHTS.pinyin),
    editDistance: boundedWeight(source.editDistance ?? DEFAULT_WEIGHTS.editDistance),
    specification: boundedWeight(source.specification ?? DEFAULT_WEIGHTS.specification),
  };
}

function normalizeText(value: string): string {
  try {
    return value.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ');
  } catch {
    return value.trim().toLowerCase();
  }
}

function boundedInteger(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return value !== undefined && Number.isSafeInteger(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function boundedWeight(value: number): number {
  return Number.isFinite(value) && value >= 0 && value <= 2 ? value : 0;
}

function boundedUnit(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}
