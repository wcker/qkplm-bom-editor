import type {
  BomCanvasRendererLabels,
  BomEditorLocale,
  LocalizedText,
} from './types.js';

const ZH_CN_LABELS: Readonly<BomCanvasRendererLabels> = Object.freeze({
  treegridLabel: 'BOM',
  treegridDescription: '',
  editorLabel: '编辑',
  rowNumberHeader: '#',
  contextMenu: Object.freeze({
    'column.insert-before': '在左侧插入列',
    'column.insert-after': '在右侧插入列',
    'column.delete': '删除列',
    'column.hide': '隐藏列',
    'column.freeze-start': '冻结至左侧',
    'column.freeze-end': '冻结至右侧',
    'column.unfreeze': '取消冻结列',
    'column.sort-asc': '升序排序',
    'column.sort-desc': '降序排序',
    'column.filter-current': '按当前值筛选',
    'column.clear-sort-filter': '清除排序和筛选',
    'column.clear-format': '清除列格式',
    'column.auto-size': '按内容自动调整列宽',
    'column.reset-width': '恢复默认列宽',
    'column.copy': '复制选区',
    'column.clear-content': '清除内容',
    'row.insert-sibling': '插入同级行',
    'row.insert-child': '插入子级行',
    'row.delete': '删除行',
    'row.move-up': '上移',
    'row.move-down': '下移',
    'row.indent': '增加缩进',
    'row.outdent': '减少缩进',
    'row.expand-all': '全部展开',
    'row.collapse-all': '全部折叠',
    'row.set-row-height': '设置行高',
    'row.auto-row-height': '自动调整行高',
    'row.reset-row-height': '恢复默认行高',
    'row.clear-content': '清除内容',
    'cell.copy': '复制选区',
    'cell.paste': '粘贴',
    'cell.clear-content': '清除内容',
    'prompt.row-height': '设置行高（像素）',
  }),
  liveRegion: Object.freeze({
    validationRejected: '输入未保存，请修正后重试。',
    commitRejected: '保存失败，编辑未保存。',
    validationCompleted: '校验完成，未发现问题。',
    validationIssuesFound: '校验完成，发现 {count} 个问题。',
    columnResizeCompleted: '列宽已调整。',
    columnReorderCompleted: '列位置已更新。',
    columnReorderTarget: '将移动到第 {position} 列。',
    treeMoveTarget: '放置到{position}。',
    treeMoveCompleted: '树结构已更新。',
  }),
  diff: Object.freeze({
    inserted: '差异：新增。',
    deleted: '差异：删除。',
    changed: '差异：已修改。',
    moved: '差异：已移动。',
    reordered: '差异：顺序已调整。',
    material: '差异：物料已变更。',
    deletedSummary: '差异：已删除 {count} 行。',
    deletedGhost: '差异：已删除行。',
  }),
});

const EN_US_LABELS: Readonly<BomCanvasRendererLabels> = Object.freeze({
  treegridLabel: 'BOM',
  treegridDescription: '',
  editorLabel: 'Edit cell',
  rowNumberHeader: '#',
  contextMenu: Object.freeze({
    'column.insert-before': 'Insert column before',
    'column.insert-after': 'Insert column after',
    'column.delete': 'Delete column',
    'column.hide': 'Hide column',
    'column.freeze-start': 'Freeze to left',
    'column.freeze-end': 'Freeze to right',
    'column.unfreeze': 'Unfreeze column',
    'column.sort-asc': 'Sort ascending',
    'column.sort-desc': 'Sort descending',
    'column.filter-current': 'Filter by current value',
    'column.clear-sort-filter': 'Clear sort and filter',
    'column.clear-format': 'Clear column formatting',
    'column.auto-size': 'Auto-size column to content',
    'column.reset-width': 'Reset column width',
    'column.copy': 'Copy selection',
    'column.clear-content': 'Clear content',
    'row.insert-sibling': 'Insert sibling row',
    'row.insert-child': 'Insert child row',
    'row.delete': 'Delete row',
    'row.move-up': 'Move up',
    'row.move-down': 'Move down',
    'row.indent': 'Increase indent',
    'row.outdent': 'Decrease indent',
    'row.expand-all': 'Expand all',
    'row.collapse-all': 'Collapse all',
    'row.set-row-height': 'Set row height',
    'row.auto-row-height': 'Auto-size row height',
    'row.reset-row-height': 'Reset row height',
    'row.clear-content': 'Clear content',
    'cell.copy': 'Copy selection',
    'cell.paste': 'Paste',
    'cell.clear-content': 'Clear content',
    'prompt.row-height': 'Set row height (pixels)',
  }),
  liveRegion: Object.freeze({
    validationRejected: 'Input was not saved. Correct it and try again.',
    commitRejected: 'Save failed. The edit was not saved.',
    validationCompleted: 'Validation complete. No issues found.',
    validationIssuesFound: 'Validation complete. Found {count} issues.',
    columnResizeCompleted: 'Column width updated.',
    columnReorderCompleted: 'Column position updated.',
    columnReorderTarget: 'Will move to column {position}.',
    treeMoveTarget: 'Drop {position}.',
    treeMoveCompleted: 'Tree structure updated.',
  }),
  diff: Object.freeze({
    inserted: 'Diff: inserted.',
    deleted: 'Diff: deleted.',
    changed: 'Diff: changed.',
    moved: 'Diff: moved.',
    reordered: 'Diff: reordered.',
    material: 'Diff: material changed.',
    deletedSummary: 'Diff: {count} rows deleted.',
    deletedGhost: 'Diff: deleted row.',
  }),
});

export const BOM_CANVAS_LABELS_BY_LOCALE: Readonly<
  Record<BomEditorLocale, Readonly<BomCanvasRendererLabels>>
> = Object.freeze({
  'zh-CN': ZH_CN_LABELS,
  'en-US': EN_US_LABELS,
});

/** The Chinese built-in labels used when no locale is specified. */
export const DEFAULT_BOM_CANVAS_LABELS = ZH_CN_LABELS;

export function resolveBomCanvasLabels(
  locale: BomEditorLocale,
): Readonly<BomCanvasRendererLabels> {
  return BOM_CANVAS_LABELS_BY_LOCALE[locale];
}

/** Resolves a static host label without invoking user code during rendering. */
export function resolveLocalizedText(
  text: LocalizedText,
  locale: BomEditorLocale,
): string {
  return text[locale] ?? text['zh-CN'];
}

export function bomCanvasTreeDropPositionLabel(
  locale: BomEditorLocale,
  position: 'before' | 'after' | 'inside',
): string {
  if (locale === 'zh-CN') {
    return position === 'before'
      ? '之前'
      : position === 'after'
        ? '之后'
        : '作为子项';
  }
  return position === 'inside' ? 'as a child' : position;
}
