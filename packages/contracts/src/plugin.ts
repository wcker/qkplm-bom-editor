import type { BomError } from './error.js';
import type { BomCommand } from './command.js';
import type {
  BomDocumentGeneration,
  BomDocumentId,
  BomInstanceId,
  BomPluginId,
  BomProtocolVersion,
  BomRequestId,
  OccurrenceId,
  RevisionToken,
} from './identifiers.js';
import type { BomSnapshotDiff } from './diff.js';
import type { BomDocumentSnapshot, BomNode } from './snapshot.js';
import type { BomSchema } from './schema.js';
import type { BomFields } from './value.js';
import type { BomValidationIssue } from './worker.js';

/** DOM-free cancellation shape used by headless plugin contracts. */
export interface BomPluginSignal {
  readonly aborted: boolean;
}

export type BomPluginCapability =
  | 'commands'
  | 'validators'
  | 'fixers'
  | 'calculations'
  | 'importers'
  | 'exporters'
  | 'dataSource'
  | 'schemaExtensions'
  | 'workerTasks'
  | `custom:${string}`;

export type BomPluginPermission =
  | 'schema:read'
  | 'document:read'
  | 'document:write'
  | 'datasource:read'
  | 'datasource:write'
  | 'file:read'
  | 'file:write'
  | 'network:request'
  | 'telemetry:emit'
  | `custom:${string}`;

export interface BomPluginManifest {
  readonly id: BomPluginId;
  readonly name: string;
  readonly version: string;
  readonly abiVersion: string;
  readonly engineRange: string;
  readonly priority?: number;
  readonly capabilities: readonly BomPluginCapability[];
  readonly permissions?: readonly BomPluginPermission[];
  readonly dependencies?: Readonly<Record<BomPluginId, string>>;
}

/**
 * Immutable host-side limits used before a same-realm plugin receives a
 * context. Omitted members use the editor's published defaults.
 */
export interface BomPluginHostConfiguration {
  /** Concrete SemVer engine version evaluated against `manifest.engineRange`. */
  readonly engineVersion?: string;
  /** ABI versions the host can negotiate, grouped by compatible major. */
  readonly supportedAbiVersions?: readonly string[];
  /** A host may disable built-in contribution capabilities, but cannot add new ones. */
  readonly supportedCapabilities?: readonly BomPluginCapability[];
  /**
   * Upper bound for one asynchronous plugin hook. Timeout aborts the hook's
   * signal and discards its eventual result; it cannot preempt synchronous JS.
   */
  readonly asyncHookTimeoutMs?: number;
  /**
   * Observation threshold for synchronous time spent invoking one plugin hook.
   * Exceeding it publishes a value-free metric but cannot preempt same-realm JS.
   */
  readonly syncHookBudgetMs?: number;
}

export type BomHeadlessPluginManifest = BomPluginManifest;

/** Host-authorized permission negotiation for a plugin install. */
export interface BomPluginGrantPolicy {
  grant(
    manifest: BomPluginManifest,
    options: { readonly signal: BomPluginSignal },
  ): Promise<readonly BomPluginPermission[]>;
}

export interface BomPluginValidationContext<
  TFields extends BomFields = BomFields,
> {
  readonly snapshot: BomDocumentSnapshot<TFields>;
  /** Present only when the plugin has the `schema:read` permission. */
  readonly schema: Readonly<BomSchema> | undefined;
  readonly scope: 'document' | 'visible' | 'selection';
  readonly occurrenceIds: readonly string[];
  readonly signal: BomPluginSignal;
}

/**
 * A value-free business-rule finding returned by a plugin validator.
 *
 * The host owns the final issue ID, rule ID, rule version, and severity.
 * Legacy plugins may echo those fields; when present, the host verifies that
 * they match the registered validator before publishing the finding.
 */
export interface BomPluginValidationFinding {
  readonly ruleId?: string;
  readonly ruleVersion?: string;
  readonly severity?: 'info' | 'warning' | 'error';
  readonly occurrenceId?: OccurrenceId;
  readonly fieldPath?: readonly string[];
  readonly messageKey: string;
  readonly messageParams?: Readonly<Record<string, string | number>>;
  readonly valueDigest?: string;
}

export interface BomPluginValidator<
  TFields extends BomFields = BomFields,
> {
  readonly ruleId: string;
  readonly version: string;
  readonly severity: 'info' | 'warning' | 'error';
  validate(
    context: Readonly<BomPluginValidationContext<TFields>>,
  ): readonly BomPluginValidationFinding[] |
    Promise<readonly BomPluginValidationFinding[]>;
}

/**
 * Untrusted repair candidate returned by a plugin fixer. The editor host owns
 * document/revision binding, Diff calculation, impact analysis, and approval.
 */
export interface BomPluginFixDraft<
  TFields extends BomFields = BomFields,
> {
  readonly proposalId: string;
  readonly ruleId: string;
  readonly titleKey: string;
  readonly confidence: number;
  readonly commands: readonly BomCommand<TFields>[];
}

/** A precise field-level member of a repair proposal's impact scope. */
export interface BomPluginFixFieldImpact {
  readonly occurrenceId: OccurrenceId;
  readonly fieldPath: readonly string[];
}

/**
 * Host-derived scope of data a repair would change. Structural changes are
 * represented by their affected occurrence IDs; field changes appear in both
 * collections.
 */
export interface BomPluginFixImpact {
  readonly occurrenceIds: readonly OccurrenceId[];
  /** Occurrences whose identity, hierarchy, or sibling order would change. */
  readonly structuralOccurrenceIds: readonly OccurrenceId[];
  readonly fieldPaths: readonly BomPluginFixFieldImpact[];
}

/**
 * A repair that overlaps this proposal and therefore needs an explicit host
 * resolution before both can be accepted.
 */
export interface BomPluginFixConflict {
  readonly proposalId: string;
  readonly impact: BomPluginFixImpact;
}

/**
 * A host-issued, immutable repair capability. Applications must retain the
 * exact object returned by `proposeFix()` and pass it unchanged to
 * `applyFix()`; reconstructing this shape is not an approval mechanism.
 */
export interface BomPluginFixProposal<
  TFields extends BomFields = BomFields,
> extends BomPluginFixDraft<TFields> {
  readonly pluginId: BomPluginId;
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly baseRevision: RevisionToken;
  readonly impact: BomPluginFixImpact;
  /**
   * Diff from an isolated dry run. Its targetRevision identifies the preview
   * snapshot only; the authoritative committed revision is returned by
   * `applyFix()` and is linked through the proposal ID in the transaction origin.
   */
  readonly diff: BomSnapshotDiff<TFields>;
  readonly conflicts: readonly BomPluginFixConflict[];
}

export interface BomPluginFixer<
  TFields extends BomFields = BomFields,
> {
  readonly fixerId: string;
  propose(
    context: Readonly<{
      readonly snapshot: BomDocumentSnapshot<TFields>;
      /** Present only when the plugin has the `schema:read` permission. */
      readonly schema: Readonly<BomSchema> | undefined;
      readonly issue: BomValidationIssue;
      readonly signal: BomPluginSignal;
    }>,
  ): BomPluginFixDraft<TFields> | Promise<BomPluginFixDraft<TFields> | null>;
}

export interface BomPluginCommandContext<
  TFields extends BomFields = BomFields,
> {
  readonly snapshot: BomDocumentSnapshot<TFields>;
  /** Present only when the plugin has the `schema:read` permission. */
  readonly schema: Readonly<BomSchema> | undefined;
  readonly signal: BomPluginSignal;
}

export interface BomPluginCommand<
  TFields extends BomFields = BomFields,
> {
  readonly commandId: string;
  execute(
    context: Readonly<BomPluginCommandContext<TFields>>,
    payload: unknown,
  ): readonly BomCommand<TFields>[] | Promise<readonly BomCommand<TFields>[]>;
}

export interface BomPluginContext<
  TFields extends BomFields = BomFields,
> {
  readonly pluginId: BomPluginId;
  readonly manifest: Readonly<BomPluginManifest>;
  /** Lowest compatible ABI surface selected by the host for this plugin. */
  readonly negotiatedAbiVersion: string;
  readonly grantedPermissions: readonly BomPluginPermission[];
  /** Aborted before the host unloads this plugin or destroys the editor. */
  readonly signal: BomPluginSignal;
  readonly schema: Readonly<BomSchema> | undefined;
  getSnapshot(): Readonly<BomDocumentSnapshot<TFields>>;
  registerValidator(validator: BomPluginValidator<TFields>): () => void;
  registerFixer(fixer: BomPluginFixer<TFields>): () => void;
  registerCommand(command: BomPluginCommand<TFields>): () => void;
}

/** Host-owned cleanup signal for a plugin being discarded or unloaded. */
export interface BomPluginCleanup {
  (
    options: Readonly<{ readonly signal: BomPluginSignal }>,
  ): void | Promise<void>;
}

export interface BomPlugin<
  TFields extends BomFields = BomFields,
> {
  readonly manifest: BomPluginManifest;
  setup(
    context: BomPluginContext<TFields>,
  ):
    | void
    | BomPluginCleanup
    | Promise<void | BomPluginCleanup>;
}

export interface BomPluginHandshakeRequest {
  readonly protocolVersion: BomProtocolVersion;
  readonly type: 'pluginHandshake';
  readonly requestId: BomRequestId;
  readonly instanceId: BomInstanceId;
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly engineVersion: string;
  readonly supportedAbiVersions: readonly string[];
  readonly hostCapabilities: readonly BomPluginCapability[];
  readonly manifest: BomPluginManifest;
  readonly grantedPermissions: readonly BomPluginPermission[];
}

export type BomPluginHandshakeDecision =
  | {
      readonly accepted: true;
      readonly negotiatedAbiVersion: string;
      readonly enabledCapabilities: readonly BomPluginCapability[];
      readonly grantedPermissions: readonly BomPluginPermission[];
    }
  | {
      readonly accepted: false;
      readonly error: BomError;
    };

export interface BomPluginHandshakeResponse {
  readonly protocolVersion: BomProtocolVersion;
  readonly type: 'pluginHandshakeResult';
  readonly requestId: BomRequestId;
  readonly instanceId: BomInstanceId;
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly pluginId: BomPluginId;
  readonly decision: BomPluginHandshakeDecision;
}

export interface BomHeadlessContributionDescriptor {
  readonly contributionId: string;
  readonly kind:
    | 'command'
    | 'validator'
    | 'fixer'
    | 'calculation'
    | 'importer'
    | 'exporter'
    | 'dataSource'
    | 'schemaExtension'
    | 'workerTask';
  readonly protocolVersion: BomProtocolVersion;
  readonly requiredPermissions?: readonly BomPluginPermission[];
}
