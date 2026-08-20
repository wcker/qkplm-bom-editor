import type {
  BomCommand as ContractCommand,
  BomDataSourceHandshakeRequest as ContractHandshake,
  BomDocumentSnapshot as ContractSnapshot,
  BomError as ContractError,
  BomPatch as ContractPatch,
  BomPluginManifest as ContractPluginManifest,
  BomWorkerTaskMessage as ContractWorkerTask,
} from '@bom-editor/contracts';
import type {
  BomCommand as RootCommand,
  BomDataSourceHandshakeRequest as RootHandshake,
  BomDocumentSnapshot as RootSnapshot,
  BomError as RootError,
  BomPatch as RootPatch,
  BomPluginManifest as RootPluginManifest,
  BomWorkerTaskMessage as RootWorkerTask,
} from '@qkplm/bom-editor';
import type {
  BomCommand as SubpathCommand,
  BomDataSourceHandshakeRequest as SubpathHandshake,
  BomDocumentSnapshot as SubpathSnapshot,
  BomError as SubpathError,
  BomPatch as SubpathPatch,
  BomPluginManifest as SubpathPluginManifest,
  BomWorkerTaskMessage as SubpathWorkerTask,
} from '@qkplm/bom-editor/contracts';
import { createBomEditor as RootCreateBomEditor } from '@qkplm/bom-editor';
import type { BomEditorOptions as RootEditorOptions } from '@qkplm/bom-editor';
import { createMemoryDataSource as PhysicalCreateMemoryDataSource } from '@bom-editor/datasource';
import type { BomDataSource as PhysicalDataSource } from '@bom-editor/datasource';
import { createBomEditor as PhysicalCreateBomEditor } from '@bom-editor/editor';
import type { BomEditorOptions as PhysicalEditorOptions } from '@bom-editor/editor';
import { buildBomIndexes as PhysicalBuildBomIndexes } from '@bom-editor/model';
import type { BomModelLimits as PhysicalModelLimits } from '@bom-editor/model';
import { mountBomCanvasRenderer as PhysicalMountCanvas } from '@bom-editor/renderer-canvas';
import type {
  BomCanvasCellAccessibleContext as PhysicalCanvasCellAccessibleContext,
  BomCanvasCellDrawContext as PhysicalCanvasCellDrawContext,
  BomCanvasCellHitTestContext as PhysicalCanvasCellHitTestContext,
  BomCanvasCellMeasureContext as PhysicalCanvasCellMeasureContext,
  BomCanvasCellRenderer as PhysicalCanvasCellRenderer,
  BomCanvasCellRendererContext as PhysicalCanvasCellRendererContext,
  BomCanvasCellRendererHit as PhysicalCanvasCellRendererHit,
  BomCanvasCellRendererHitTarget as PhysicalCanvasCellRendererHitTarget,
  BomCanvasCellRendererRegistration as PhysicalCanvasCellRendererRegistration,
  BomCanvasCellSize as PhysicalCanvasCellSize,
  BomCanvasRenderer as PhysicalCanvasRenderer,
  BomCanvasRendererCallbacks as PhysicalCanvasRendererCallbacks,
  BomCanvasRendererDiagnostic as PhysicalCanvasRendererDiagnostic,
  BomCanvasRendererOptions as PhysicalCanvasRendererOptions,
} from '@bom-editor/renderer-canvas';
import {
  BOM_INTERNAL_CLIPBOARD_MIME as PhysicalInternalClipboardMime,
  createBomEditStateMachine as PhysicalCreateEditStateMachine,
} from '@bom-editor/runtime';
import type {
  BomCellRange as PhysicalCellRange,
  BomEventMap as PhysicalEventMap,
  BomPasteInput as PhysicalPasteInput,
  BomPasteOperationEvent as PhysicalPasteOperationEvent,
  BomSelectionState as PhysicalSelectionState,
} from '@bom-editor/runtime';
import { createBomTransactionEngine as PhysicalCreateTransactionEngine } from '@bom-editor/transaction';
import type { BomHistoryState as PhysicalHistoryState } from '@bom-editor/transaction';
import { createMemoryDataSource as FacadeCreateMemoryDataSource } from '@qkplm/bom-editor/datasource';
import type { BomDataSource as FacadeDataSource } from '@qkplm/bom-editor/datasource';
import { buildBomIndexes as FacadeBuildBomIndexes } from '@qkplm/bom-editor/model';
import type { BomModelLimits as FacadeModelLimits } from '@qkplm/bom-editor/model';
import { mountBomCanvasRenderer as FacadeMountCanvas } from '@qkplm/bom-editor/renderer/canvas';
import type {
  BomCanvasCellAccessibleContext as FacadeCanvasCellAccessibleContext,
  BomCanvasCellDrawContext as FacadeCanvasCellDrawContext,
  BomCanvasCellHitTestContext as FacadeCanvasCellHitTestContext,
  BomCanvasCellMeasureContext as FacadeCanvasCellMeasureContext,
  BomCanvasCellRenderer as FacadeCanvasCellRenderer,
  BomCanvasCellRendererContext as FacadeCanvasCellRendererContext,
  BomCanvasCellRendererHit as FacadeCanvasCellRendererHit,
  BomCanvasCellRendererHitTarget as FacadeCanvasCellRendererHitTarget,
  BomCanvasCellRendererRegistration as FacadeCanvasCellRendererRegistration,
  BomCanvasCellSize as FacadeCanvasCellSize,
  BomCanvasRenderer as FacadeCanvasRenderer,
  BomCanvasRendererCallbacks as FacadeCanvasRendererCallbacks,
  BomCanvasRendererDiagnostic as FacadeCanvasRendererDiagnostic,
  BomCanvasRendererOptions as FacadeCanvasRendererOptions,
} from '@qkplm/bom-editor/renderer/canvas';
import {
  BOM_INTERNAL_CLIPBOARD_MIME as FacadeInternalClipboardMime,
  createBomEditStateMachine as FacadeCreateEditStateMachine,
} from '@qkplm/bom-editor/runtime';
import type {
  BomCellRange as FacadeCellRange,
  BomEventMap as FacadeEventMap,
  BomPasteInput as FacadePasteInput,
  BomPasteOperationEvent as FacadePasteOperationEvent,
  BomSelectionState as FacadeSelectionState,
} from '@qkplm/bom-editor/runtime';
import { createBomTransactionEngine as FacadeCreateTransactionEngine } from '@qkplm/bom-editor/transaction';
import type { BomHistoryState as FacadeHistoryState } from '@qkplm/bom-editor/transaction';

type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends
  (<T>() => T extends TRight ? 1 : 2)
    ? (<T>() => T extends TRight ? 1 : 2) extends
        (<T>() => T extends TLeft ? 1 : 2)
      ? true
      : false
    : false;

type Assert<TValue extends true> = TValue;

export type CoreReexportFixture = readonly [
  Assert<Equal<RootCommand, ContractCommand>>,
  Assert<Equal<SubpathCommand, ContractCommand>>,
  Assert<Equal<RootHandshake, ContractHandshake>>,
  Assert<Equal<SubpathHandshake, ContractHandshake>>,
  Assert<Equal<RootSnapshot, ContractSnapshot>>,
  Assert<Equal<SubpathSnapshot, ContractSnapshot>>,
  Assert<Equal<RootError, ContractError>>,
  Assert<Equal<SubpathError, ContractError>>,
  Assert<Equal<RootPatch, ContractPatch>>,
  Assert<Equal<SubpathPatch, ContractPatch>>,
  Assert<Equal<RootPluginManifest, ContractPluginManifest>>,
  Assert<Equal<SubpathPluginManifest, ContractPluginManifest>>,
  Assert<Equal<RootWorkerTask, ContractWorkerTask>>,
  Assert<Equal<SubpathWorkerTask, ContractWorkerTask>>,
  Assert<Equal<RootEditorOptions, PhysicalEditorOptions>>,
  Assert<Equal<typeof RootCreateBomEditor, typeof PhysicalCreateBomEditor>>,
  Assert<Equal<FacadeModelLimits, PhysicalModelLimits>>,
  Assert<Equal<typeof FacadeBuildBomIndexes, typeof PhysicalBuildBomIndexes>>,
  Assert<Equal<FacadeHistoryState, PhysicalHistoryState>>,
  Assert<
    Equal<
      typeof FacadeCreateTransactionEngine,
      typeof PhysicalCreateTransactionEngine
    >
  >,
  Assert<Equal<FacadeDataSource, PhysicalDataSource>>,
  Assert<
    Equal<typeof FacadeCreateMemoryDataSource, typeof PhysicalCreateMemoryDataSource>
  >,
  Assert<Equal<FacadeEventMap, PhysicalEventMap>>,
  Assert<Equal<FacadeCellRange, PhysicalCellRange>>,
  Assert<Equal<FacadePasteInput, PhysicalPasteInput>>,
  Assert<Equal<FacadePasteOperationEvent, PhysicalPasteOperationEvent>>,
  Assert<Equal<FacadeSelectionState, PhysicalSelectionState>>,
  Assert<Equal<typeof FacadeInternalClipboardMime, typeof PhysicalInternalClipboardMime>>,
  Assert<
    Equal<typeof FacadeCreateEditStateMachine, typeof PhysicalCreateEditStateMachine>
  >,
  Assert<Equal<FacadeCanvasRenderer, PhysicalCanvasRenderer>>,
  Assert<Equal<FacadeCanvasRendererCallbacks, PhysicalCanvasRendererCallbacks>>,
  Assert<Equal<FacadeCanvasCellSize, PhysicalCanvasCellSize>>,
  Assert<Equal<FacadeCanvasCellRendererContext, PhysicalCanvasCellRendererContext>>,
  Assert<Equal<FacadeCanvasCellMeasureContext, PhysicalCanvasCellMeasureContext>>,
  Assert<Equal<FacadeCanvasCellDrawContext, PhysicalCanvasCellDrawContext>>,
  Assert<Equal<FacadeCanvasCellHitTestContext, PhysicalCanvasCellHitTestContext>>,
  Assert<Equal<FacadeCanvasCellAccessibleContext, PhysicalCanvasCellAccessibleContext>>,
  Assert<Equal<FacadeCanvasCellRendererHitTarget, PhysicalCanvasCellRendererHitTarget>>,
  Assert<Equal<FacadeCanvasCellRendererHit, PhysicalCanvasCellRendererHit>>,
  Assert<Equal<FacadeCanvasCellRenderer, PhysicalCanvasCellRenderer>>,
  Assert<
    Equal<
      FacadeCanvasCellRendererRegistration,
      PhysicalCanvasCellRendererRegistration
    >
  >,
  Assert<Equal<FacadeCanvasRendererDiagnostic, PhysicalCanvasRendererDiagnostic>>,
  Assert<Equal<FacadeCanvasRendererOptions, PhysicalCanvasRendererOptions>>,
  Assert<Equal<typeof FacadeMountCanvas, typeof PhysicalMountCanvas>>,
];
