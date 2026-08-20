export {
  deviceToLogicalCoordinate,
  logicalToDeviceCoordinate,
  resolveEffectiveDpr,
  type BomDprResolution,
  type BomDprResolutionInput,
} from './dpr.js';
export {
  hitTestCanvasCell,
  type BomCanvasCellHit,
  type BomCanvasCellHitTarget,
  type BomCanvasHitTestInput,
} from './hit-test.js';
export {
  calculateCanvasSurfaceLayout,
  calculateColumnWindow,
  calculateRowLayout,
  type BomCanvasColumnLayout,
  type BomCanvasColumnWindow,
  type BomCanvasRowLayout,
  type BomCanvasRowMetric,
  type BomCanvasSurfaceLayout,
} from './layout.js';
export {
  BOM_CANVAS_LABELS_BY_LOCALE,
  DEFAULT_BOM_CANVAS_LABELS,
  bomCanvasTreeDropPositionLabel,
  resolveBomCanvasLabels,
  resolveLocalizedText,
} from './i18n.js';
export {
  DEFAULT_BOM_CANVAS_THEME,
  mountBomCanvasRenderer,
} from './renderer.js';
export {
  BOM_CANVAS_FRAME_COMMIT_PROTOCOL,
  BOM_CANVAS_DIFF_VIEW_PROTOCOL,
  BOM_CANVAS_WORKER_TASK_LEDGER_PROTOCOL,
} from './types.js';
export type * from './types.js';
export {
  BomShortcutRegistry,
  defaultBomShortcutBindings,
  validateBomShortcutOptions,
} from './shortcuts.js';
export type { BomShortcutMatch } from './shortcuts.js';
export type {
  VisibleProjection,
  VisibleWindow,
} from '@bom-editor/visible-projection';
