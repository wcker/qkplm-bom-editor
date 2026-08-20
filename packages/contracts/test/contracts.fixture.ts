import type {
  BomAgentCapabilityDescriptor,
  BomAgentRequest,
  BomAgentResponse,
  BomCommandBatch,
  BomDataSourceHandshakeRequest,
  BomDecimal,
  BomDocumentSnapshot,
  BomGenericCancellableEvent,
  BomPatch,
  BomPluginManifest,
  BomRecoveryBundle,
  BomSchema,
  BomSnapshotDiff,
  BomTransactionCommittedEvent,
  BomTransactionPersistenceChangedEvent,
  BomWorkerDiffResult,
  BomWorkerTaskMessage,
} from '../src/index.js';

type AssertContract<TContract, TFixture extends TContract> = TFixture;

type FixtureFields = Readonly<{
  name: string;
  quantity: BomDecimal;
}>;

type FixtureSchema = AssertContract<
  BomSchema,
  {
    readonly schemaVersion: '1.0.0';
    readonly fields: readonly [
      {
        readonly fieldId: 'name';
        readonly path: readonly ['name'];
        readonly type: {
          readonly kind: 'string';
          readonly maxLength: 200;
        };
        readonly required: true;
        readonly nullable: false;
      },
      {
        readonly fieldId: 'quantity';
        readonly path: readonly ['quantity'];
        readonly type: {
          readonly kind: 'decimal';
          readonly maxScale: 3;
          readonly roundingMode: 'halfEven';
          readonly unitFamily: 'quantity';
        };
        readonly required: true;
        readonly nullable: false;
        readonly defaultValue: {
          readonly $type: 'decimal';
          readonly value: '0.000';
          readonly unit: 'pcs';
        };
      },
    ];
    readonly allowAdditionalFields: false;
    readonly recommendedDepth: 6;
    readonly maximumDepth: 128;
    readonly canonicalizationVersion: '1';
    readonly contentHashAlgorithm: 'SHA-256';
  }
>;

type FixtureSnapshot = AssertContract<
  BomDocumentSnapshot<FixtureFields>,
  {
    readonly schemaVersion: FixtureSchema['schemaVersion'];
    readonly documentId: 'document-1';
    readonly revision: 'local-1';
    readonly sourceRevision: 'source-1';
    readonly positionKeyCodecVersion: 'lexicographic-ascii-v1';
    readonly completeness: 'complete';
    readonly knownRootCount: 1;
    readonly roots: readonly ['occurrence-1'];
    readonly nodes: readonly [
      {
        readonly occurrenceId: 'occurrence-1';
        readonly kind: 'material';
        readonly materialId: 'material-1';
        readonly materialCode: 'MAT-001';
        readonly parentId: null;
        readonly positionKey: 'a0';
        readonly childrenState: 'complete';
        readonly knownChildCount: 0;
        readonly fields: {
          readonly name: 'Fastener';
          readonly quantity: {
            readonly $type: 'decimal';
            readonly value: '2.000';
            readonly unit: 'pcs';
          };
        };
      },
    ];
  }
>;

type FixturePatch = AssertContract<
  BomPatch<FixtureFields>,
  {
    readonly protocolVersion: '1.0.0';
    readonly documentId: FixtureSnapshot['documentId'];
    readonly baseRevision: FixtureSnapshot['revision'];
    readonly transactionId: 'transaction-1';
    readonly origin: 'fixture';
    readonly timestamp: '2026-07-18T00:00:00.000Z';
    readonly idempotencyKey: 'fixture-transaction-1';
    readonly operations: readonly [
      {
        readonly op: 'updateField';
        readonly occurrenceId: 'occurrence-1';
        readonly fieldPath: readonly ['quantity'];
        readonly value: {
          readonly $type: 'decimal';
          readonly value: '3.000';
          readonly unit: 'pcs';
        };
        readonly expectedValueHash: 'sha256:fixture';
      },
    ];
  }
>;

type FixtureCommandBatch = AssertContract<
  BomCommandBatch<FixtureFields>,
  {
    readonly protocolVersion: '1.0.0';
    readonly documentId: FixtureSnapshot['documentId'];
    readonly documentGeneration: 1;
    readonly baseRevision: FixtureSnapshot['revision'];
    readonly transactionId: 'transaction-1';
    readonly dependsOnTransactionId: 'transaction-0';
    readonly origin: 'fixture';
    readonly timestamp: '2026-07-18T00:00:00.000Z';
    readonly idempotencyKey: 'fixture-transaction-1';
    readonly commands: readonly [
      {
        readonly type: 'setField';
        readonly occurrenceId: 'occurrence-1';
        readonly fieldPath: readonly ['name'];
        readonly value: 'Fastener, M8';
      },
    ];
  }
>;

type FixtureDiff = AssertContract<
  BomSnapshotDiff<FixtureFields>,
  {
    readonly schemaVersion: FixtureSchema['schemaVersion'];
    readonly documentId: FixtureSnapshot['documentId'];
    readonly sourceRevision: FixtureSnapshot['revision'];
    readonly targetRevision: 'local-2';
    readonly positionKeyCodecVersion: FixtureSnapshot['positionKeyCodecVersion'];
    readonly changes: readonly [
      {
        readonly type: 'field';
        readonly occurrenceId: 'occurrence-1';
        readonly fieldId: 'name';
        readonly fieldPath: readonly ['name'];
        readonly before: {
          readonly present: true;
          readonly value: 'Fastener';
        };
        readonly after: {
          readonly present: true;
          readonly value: 'Fastener, M8';
        };
      },
    ];
  }
>;

type FixtureWorkerDiffResult = AssertContract<
  BomWorkerDiffResult<FixtureFields>,
  {
    readonly taskType: 'diff';
    readonly diff: FixtureDiff;
  }
>;

type FixtureWorkerEnvelope = AssertContract<
  BomWorkerTaskMessage<FixtureFields>,
  {
    readonly protocolVersion: '1.0.0';
    readonly type: 'task';
    readonly instanceId: 'instance-1';
    readonly taskId: 'task-1';
    readonly documentId: FixtureSnapshot['documentId'];
    readonly documentGeneration: 1;
    readonly documentRevision: FixtureSnapshot['revision'];
    readonly priority: 'normal';
    readonly cancellationKey: 'cancel-task-1';
    readonly cancellable: true;
    readonly replayable: true;
    readonly taskType: 'buildSearchIndex';
    readonly payload: {
      readonly snapshot: FixtureSnapshot;
      readonly fieldIds: readonly ['name'];
      readonly normalizationVersion: '1';
    };
  }
>;

type FixtureWorkerDiffTask = AssertContract<
  BomWorkerTaskMessage<FixtureFields>,
  {
    readonly protocolVersion: '1.0.0';
    readonly type: 'task';
    readonly instanceId: 'instance-1';
    readonly taskId: 'task-diff-1';
    readonly documentId: FixtureSnapshot['documentId'];
    readonly documentGeneration: 1;
    readonly documentRevision: FixtureSnapshot['revision'];
    readonly priority: 'low';
    readonly cancellationKey: 'cancel-task-diff-1';
    readonly cancellable: true;
    readonly replayable: true;
    readonly taskType: 'diff';
    readonly payload: {
      readonly schema: FixtureSchema;
      readonly source: FixtureSnapshot;
      readonly target: FixtureSnapshot;
    };
  }
>;

type FixtureDataSourceHandshake = AssertContract<
  BomDataSourceHandshakeRequest,
  {
    readonly protocolVersion: '1.0.0';
    readonly type: 'handshake';
    readonly requestId: 'request-1';
    readonly documentGeneration: 1;
    readonly supportedProtocolVersions: readonly ['1.0.0'];
  }
>;

type FixturePluginManifest = AssertContract<
  BomPluginManifest,
  {
    readonly id: 'fixture.headless';
    readonly name: 'Fixture Headless Plugin';
    readonly version: '1.0.0';
    readonly abiVersion: '1.0.0';
    readonly engineRange: '^1.0.0';
    readonly capabilities: readonly ['validators', 'workerTasks'];
    readonly permissions: readonly ['schema:read', 'document:read'];
  }
>;

type FixtureCommittedEvent = AssertContract<
  BomTransactionCommittedEvent<FixtureFields>,
  {
    readonly type: 'transactionCommitted';
    readonly instanceId: FixtureWorkerEnvelope['instanceId'];
    readonly sequence: 1;
    readonly timestamp: 1784323200000;
    readonly documentId: FixtureSnapshot['documentId'];
    readonly documentGeneration: 1;
    readonly transactionId: FixturePatch['transactionId'];
    readonly origin: FixturePatch['origin'];
    readonly previousRevision: FixturePatch['baseRevision'];
    readonly revision: 'local-2';
    readonly patch: FixturePatch;
    readonly commit: {
      readonly transactionId: FixturePatch['transactionId'];
      readonly previousRevision: FixturePatch['baseRevision'];
      readonly revision: 'local-2';
      readonly patch: FixturePatch;
      readonly warnings: readonly [];
    };
  }
>;

type FixtureRecoveryBundle = AssertContract<
  BomRecoveryBundle<FixtureFields>,
  {
    readonly protocolVersion: '1.0.0';
    readonly documentId: FixtureSnapshot['documentId'];
    readonly schemaVersion: FixtureSchema['schemaVersion'];
    readonly positionKeyCodecVersion: FixtureSnapshot['positionKeyCodecVersion'];
    readonly baseRevision: FixtureSnapshot['revision'];
    readonly sourceRevision: 'source-1';
    readonly failedTransactionId: FixturePatch['transactionId'];
    readonly createdAt: '2026-07-20T00:00:00.000Z';
    readonly transactions: readonly [];
    readonly reason: {
      readonly code: 'BOM_DATASOURCE_RECOVERY_FAILED';
      readonly category: 'IO';
      readonly messageKey: 'bom.datasource.recoveryFailed';
      readonly recoverable: true;
    };
  }
>;

type FixturePersistenceChangedEvent = AssertContract<
  BomTransactionPersistenceChangedEvent<FixtureFields>,
  {
    readonly type: 'transactionPersistenceChanged';
    readonly instanceId: FixtureWorkerEnvelope['instanceId'];
    readonly sequence: 2;
    readonly timestamp: 1784323200001;
    readonly documentId: FixtureSnapshot['documentId'];
    readonly documentGeneration: 1;
    readonly transactionId: FixturePatch['transactionId'];
    readonly origin: FixturePatch['origin'];
    readonly previousRevision: FixturePatch['baseRevision'];
    readonly revision: 'local-2';
    readonly patch: FixturePatch;
    readonly state: 'reloadRequired';
    readonly sourceRevision: 'source-1';
    readonly recoveryId: 'recovery-1';
    readonly retryable: true;
    readonly recoveryBundle: FixtureRecoveryBundle;
    readonly error: FixtureRecoveryBundle['reason'];
  }
>;

type FixtureAgentRequest = AssertContract<
  BomAgentRequest,
  {
    readonly protocol: 'bom-editor-capabilities/v1';
    readonly requestId: 'agent-request-1';
    readonly instanceId: 'instance-1';
    readonly capability: 'executeCommand';
    readonly origin: 'assistant.bom';
    readonly documentId: FixtureSnapshot['documentId'];
    readonly documentGeneration: 1;
    readonly baseRevision: FixtureSnapshot['revision'];
    readonly idempotencyKey: 'agent-command-1';
    readonly input: {
      readonly command: {
        readonly type: 'setField';
        readonly occurrenceId: 'occurrence-1';
        readonly fieldPath: readonly ['name'];
        readonly value: 'Agent update';
      };
    };
  }
>;

type FixtureAgentCapability = AssertContract<
  BomAgentCapabilityDescriptor,
  {
    readonly id: 'executeCommand';
    readonly access: 'write';
    readonly requiredPermissions: readonly ['document:write'];
    readonly requiresDocumentTarget: true;
    readonly requiresBaseRevision: true;
    readonly requiresIdempotencyKey: true;
    readonly supportsDryRun: false;
    readonly inputSchema: true;
  }
>;

type FixtureAgentResponse = AssertContract<
  BomAgentResponse,
  {
    readonly protocol: 'bom-editor-capabilities/v1';
    readonly requestId: FixtureAgentRequest['requestId'];
    readonly ok: true;
    readonly value: null;
    readonly document: {
      readonly documentId: FixtureSnapshot['documentId'];
      readonly documentGeneration: 1;
      readonly revision: 'local-2';
    };
  }
>;

type FixtureBeforeEditEvent = AssertContract<
  BomGenericCancellableEvent<'beforeEdit'>,
  {
    readonly type: 'beforeEdit';
    readonly instanceId: 'instance-1';
    readonly sequence: 2;
    readonly timestamp: 1784323200001;
    readonly documentId: FixtureSnapshot['documentId'];
    readonly documentGeneration: 1;
    readonly cancellable: true;
    readonly payload: {
      readonly occurrenceId: 'occurrence-1';
      readonly fieldId: 'quantity';
    };
  }
>;

export type ContractCompileFixtures = Readonly<{
  schema: FixtureSchema;
  snapshot: FixtureSnapshot;
  commandBatch: FixtureCommandBatch;
  patch: FixturePatch;
  diff: FixtureDiff;
  workerDiffResult: FixtureWorkerDiffResult;
  worker: FixtureWorkerEnvelope;
  workerDiffTask: FixtureWorkerDiffTask;
  dataSourceHandshake: FixtureDataSourceHandshake;
  pluginManifest: FixturePluginManifest;
  committedEvent: FixtureCommittedEvent;
  persistenceChangedEvent: FixturePersistenceChangedEvent;
  beforeEditEvent: FixtureBeforeEditEvent;
  agentRequest: FixtureAgentRequest;
  agentCapability: FixtureAgentCapability;
  agentResponse: FixtureAgentResponse;
}>;
