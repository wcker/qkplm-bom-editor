import type { BomDocumentSnapshot, BomFields, BomSchema } from '@bom-editor/contracts';

export type BomFixtureHierarchy = 'nested' | 'flat';

export interface BomFixtureDefinition {
  readonly id: string;
  readonly generatorVersion: '1.0.0';
  readonly seed: number;
  readonly nodeCount: number;
  readonly maxDepth: number;
  readonly hierarchy: BomFixtureHierarchy;
  readonly fieldCount: number;
  readonly duplicateMaterialRatio: number;
  readonly validationErrorRate: number;
}

export interface BomFixtureManifestEntry {
  readonly id: string;
  readonly definitionFingerprint: string;
  readonly generatorVersion: BomFixtureDefinition['generatorVersion'];
  readonly schemaVersion: string;
  readonly seed: number;
  readonly nodeCount: number;
  readonly maxDepth: number;
  readonly hierarchy: BomFixtureHierarchy;
  readonly fieldCount: number;
  readonly duplicateMaterialRatio: number;
  readonly validationErrorRate: number;
}

export interface GeneratedBomFixture<TFields extends BomFields = BomFields> {
  readonly definition: BomFixtureDefinition;
  readonly manifest: BomFixtureManifestEntry;
  readonly schema: BomSchema;
  readonly snapshot: BomDocumentSnapshot<TFields>;
}

export interface BomBenchmarkColumn {
  readonly columnId: string;
  readonly label: string;
  readonly source:
    | {
        readonly kind: 'node';
        readonly property: 'materialCode' | 'occurrenceId';
      }
    | {
        readonly kind: 'field';
        readonly fieldId: string;
      };
  readonly width: number;
  readonly frozen: boolean;
  readonly editable: boolean;
}

export interface BomBenchmarkScenarioDefinition {
  readonly id: string;
  readonly scenarioVersion: '1.1.0';
  readonly fixtureId: string;
  readonly viewport: Readonly<{
    readonly width: number;
    readonly height: number;
    readonly devicePixelRatio: number;
  }>;
  readonly font: Readonly<{
    readonly family: string;
    readonly sizePx: number;
    readonly weight: number;
    readonly sha256: string;
  }>;
  readonly layout: Readonly<{
    readonly headerHeight: number;
    readonly rowHeight: number;
    readonly overscanPx: number;
    readonly canvasLayerCount: number;
    readonly maxBackingStoreBytes: number;
  }>;
  readonly expansion: Readonly<{
    readonly strategy: 'all';
  }>;
  readonly columns: readonly BomBenchmarkColumn[];
  readonly interaction: Readonly<{
    readonly targetOccurrenceOrdinal: number;
    readonly targetColumnId: string;
    readonly replacementText: string;
    readonly commitKey: 'Enter';
  }>;
  readonly scrollTrajectory: Readonly<{
    readonly protocol: 'bom-f3-scroll-trajectory/v1';
    readonly axis: 'vertical';
    readonly waveform: 'triangle';
    readonly direction: 'forward-then-reverse';
    readonly easing: 'linear';
    readonly driver: 'requestAnimationFrame';
    readonly cycles: 1;
    readonly durationMs: 30_000;
  }>;
  readonly measurement: Readonly<{
    readonly warmupRuns: number;
    readonly sampleRuns: number;
    readonly refreshRateHz: number;
    readonly scrollDurationMs: number;
    readonly startupP95Ms: number;
    readonly inputP95Ms: number;
    readonly inputP99Ms: number;
    readonly frameP95Ms: number;
    readonly frameP99Ms: number;
  }>;
}

export interface BomBenchmarkScenarioManifestEntry {
  readonly id: string;
  readonly scenarioVersion: BomBenchmarkScenarioDefinition['scenarioVersion'];
  readonly fixtureId: string;
  readonly scenarioFingerprint: string;
}
