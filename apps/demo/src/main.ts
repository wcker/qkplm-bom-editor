import {
  createBomEditor,
  type BomColumnDefinition,
} from '@qkplm/bom-editor';
import {
  BOM_10K_D6,
  F3_10K_EDIT_SCENARIO,
  generateFixture,
  validateBenchmarkScenario,
} from '@bom-editor/benchmark-fixtures';

const revisionValue = requiredElement<HTMLElement>('revision-value');
const nodeCountValue = requiredElement<HTMLElement>('node-count-value');
const visibleCountValue = requiredElement<HTMLElement>('visible-count-value');
const capabilitiesValue = requiredElement<HTMLElement>('capabilities-value');
const timingValue = requiredElement<HTMLElement>('timing-value');
const sessionStatus = requiredElement<HTMLElement>('session-status');
const sessionIndicator = requiredElement<HTMLElement>('session-indicator');
const scenarioTarget = requiredElement<HTMLElement>('scenario-target');
const editorHost = requiredElement<HTMLDivElement>('editor-host');
const bootOverlay = requiredElement<HTMLDivElement>('boot-overlay');
const undoButton = requiredElement<HTMLButtonElement>('undo-button');
const redoButton = requiredElement<HTMLButtonElement>('redo-button');
const reloadButton = requiredElement<HTMLButtonElement>('reload-button');
const scenarioButton = requiredElement<HTMLButtonElement>('scenario-button');
const findButton = requiredElement<HTMLButtonElement>('find-button');
const columnSettingsButton = requiredElement<HTMLButtonElement>('column-settings-button');
const commandMore = requiredElement<HTMLDetailsElement>('command-more');
const freezeStartButton = requiredElement<HTMLButtonElement>('freeze-start-button');
const freezeEndButton = requiredElement<HTMLButtonElement>('freeze-end-button');
const unfreezeButton = requiredElement<HTMLButtonElement>('unfreeze-button');
const shortcutsButton = requiredElement<HTMLButtonElement>('shortcuts-button');
const findPanel = requiredElement<HTMLElement>('find-panel');
const shortcutsPanel = requiredElement<HTMLElement>('shortcuts-panel');
const findCloseButton = requiredElement<HTMLButtonElement>('find-close-button');
const shortcutsCloseButton = requiredElement<HTMLButtonElement>('shortcuts-close-button');
const columnSettingsPanel = requiredElement<HTMLElement>('column-settings-panel');
const columnSettingsCloseButton = requiredElement<HTMLButtonElement>('column-settings-close-button');
const columnSettingsColumn = requiredElement<HTMLElement>('column-settings-column');
const columnLabelInput = requiredElement<HTMLInputElement>('column-label-input');
const columnFieldNameInput = requiredElement<HTMLInputElement>('column-field-name-input');
const columnFieldNameList = requiredElement<HTMLDataListElement>('column-field-name-list');
const columnFieldNameHint = requiredElement<HTMLElement>('column-field-name-hint');
const columnFieldPath = requiredElement<HTMLOutputElement>('column-field-path');
const columnFormatSelect = requiredElement<HTMLSelectElement>('column-format-select');
const columnNumberOptions = requiredElement<HTMLElement>('column-number-options');
const columnMinimumFraction = requiredElement<HTMLInputElement>('column-minimum-fraction');
const columnMaximumFraction = requiredElement<HTMLInputElement>('column-maximum-fraction');
const columnGroupingControl = requiredElement<HTMLElement>('column-grouping-control');
const columnGroupingCheckbox = requiredElement<HTMLInputElement>('column-grouping-checkbox');
const columnUnitControl = requiredElement<HTMLElement>('column-unit-control');
const columnUnitDisplay = requiredElement<HTMLSelectElement>('column-unit-display');
const columnDateOptions = requiredElement<HTMLElement>('column-date-options');
const columnDateStyleSelect = requiredElement<HTMLSelectElement>('column-date-style-select');
const columnTimeStyleControl = requiredElement<HTMLElement>('column-time-style-control');
const columnTimeStyleSelect = requiredElement<HTMLSelectElement>('column-time-style-select');
const columnFractionOptions = requiredElement<HTMLElement>('column-fraction-options');
const columnFractionDenominatorSelect = requiredElement<HTMLSelectElement>('column-fraction-denominator-select');
const columnFractionGroupingCheckbox = requiredElement<HTMLInputElement>('column-fraction-grouping-checkbox');
const columnCurrencyOptions = requiredElement<HTMLElement>('column-currency-options');
const columnCurrencySelect = requiredElement<HTMLSelectElement>('column-currency-select');
const columnFormatPreview = requiredElement<HTMLOutputElement>('column-format-preview');
const columnAlignmentButtons = Object.freeze(
  Array.from(document.querySelectorAll<HTMLButtonElement>('[data-column-alignment]')),
);
const columnWrapCheckbox = requiredElement<HTMLInputElement>('column-wrap-checkbox');
const columnSettingsApply = requiredElement<HTMLButtonElement>('column-settings-apply');
let selectedColumnAlignment: 'start' | 'center' | 'end' = 'start';
const findForm = requiredElement<HTMLFormElement>('find-form');
const findInput = requiredElement<HTMLInputElement>('find-input');
const findMode = requiredElement<HTMLSelectElement>('find-mode');
const findCaseSensitive = requiredElement<HTMLInputElement>('find-case-sensitive');
const findPreviousButton = requiredElement<HTMLButtonElement>('find-previous-button');
const findNextButton = requiredElement<HTMLButtonElement>('find-next-button');
const findCounter = requiredElement<HTMLOutputElement>('find-counter');
const findStatus = requiredElement<HTMLElement>('find-status');
const findMatchWholeCell = requiredElement<HTMLInputElement>('find-match-whole-cell');
const commandButtons = Object.freeze([
  undoButton,
  redoButton,
  reloadButton,
  scenarioButton,
  findButton,
  columnSettingsButton,
  freezeStartButton,
  freezeEndButton,
  unfreezeButton,
  shortcutsButton,
]);
const integerFormat = new Intl.NumberFormat('zh-CN');
const durationFormat = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const COLUMN_LABELS = Object.freeze({
  materialCode: '物料编码',
  name: '名称',
  quantity: '数量',
  category: '分类',
  description: '描述',
});

void bootstrap().catch(showFatalError);

async function bootstrap(): Promise<void> {
  const startupStarted = performance.now();
  setSession('正在生成确定性 10K 夹具', 'loading');
  const fixture = generateFixture(BOM_10K_D6);
  const scenario = F3_10K_EDIT_SCENARIO;
  const scenarioErrors = validateBenchmarkScenario(
    scenario,
    fixture.definition,
    fixture.schema,
  );
  if (scenarioErrors.length > 0) {
    throw new Error('BOM_DEMO_SCENARIO_INVALID');
  }
  const materialCodeByOccurrence = new Map(
    fixture.snapshot.nodes.map((node) => [
      node.occurrenceId,
      node.materialCode ?? '',
    ]),
  );
  const schemaFieldById = new Map(
    fixture.schema.fields.map((field) => [field.fieldId, field]),
  );
  const rendererMetadataColumnIds = new Set(
    scenario.columns
      .filter((column) => column.source.kind !== 'field')
      .map((column) => column.columnId),
  );
  const fallbackField = schemaFieldById.get('name');
  if (fallbackField === undefined) {
    throw new Error('BOM_DEMO_NAME_FIELD_MISSING');
  }
  const fieldNameOptions = document.createDocumentFragment();
  for (const field of fixture.schema.fields) {
    const option = document.createElement('option');
    option.value = field.fieldId;
    option.label = field.path.join('.');
    fieldNameOptions.append(option);
  }
  columnFieldNameList.replaceChildren(fieldNameOptions);
  let columns: readonly Readonly<BomColumnDefinition>[] = Object.freeze(
    scenario.columns.map((column) => {
      // F3 columns may read node metadata, while the current public column
      // contract requires a schema path. The formatter below owns that display.
      const field =
        column.source.kind === 'field'
          ? schemaFieldById.get(column.source.fieldId)
          : fallbackField;
      if (field === undefined) {
        throw new Error('BOM_DEMO_SCENARIO_FIELD_MISSING');
      }
      return Object.freeze({
        columnId: column.columnId,
        fieldName: field.fieldId,
        fieldPath: field.path,
        label: localizeColumnLabel(column.columnId, column.label),
        width: column.width,
        editable: column.source.kind === 'field' && column.editable,
        frozen: column.frozen ? ('start' as const) : false,
        a11y: Object.freeze({ label: localizeColumnLabel(column.columnId, column.label) }),
      });
    }),
  );
  const targetNode =
    fixture.snapshot.nodes[scenario.interaction.targetOccurrenceOrdinal];
  const targetColumn = scenario.columns.find(
    (column) => column.columnId === scenario.interaction.targetColumnId,
  );
  if (targetNode === undefined || targetColumn?.source.kind !== 'field') {
    throw new Error('BOM_DEMO_SCENARIO_TARGET_INVALID');
  }
  const targetField = schemaFieldById.get(targetColumn.source.fieldId);
  if (targetField === undefined) {
    throw new Error('BOM_DEMO_SCENARIO_TARGET_FIELD_MISSING');
  }
  scenarioTarget.textContent =
    '目标 #' +
    integerFormat.format(scenario.interaction.targetOccurrenceOrdinal) +
    ' / ' +
    localizeColumnLabel(targetColumn.columnId, targetColumn.label);

  const editor = createBomEditor({
    schema: fixture.schema,
    columns,
    initialDocument: fixture.snapshot,
    instanceId: 'bom-editor-f3-demo',
    initialView: {
      rowHeight: scenario.layout.rowHeight,
      expandAll: scenario.expansion.strategy === 'all',
    },
    renderer: {
      headerHeight: scenario.layout.headerHeight,
      overscanX: scenario.layout.overscanPx,
      overscanY: scenario.layout.overscanPx,
      maxDpr: scenario.viewport.devicePixelRatio,
      maxBackingStoreBytes: scenario.layout.maxBackingStoreBytes,
      labels: {
        treegridLabel: '10K BOM 结构编辑器',
        treegridDescription: '可使用键盘浏览、选择和编辑 BOM 单元格。',
        editorLabel: 'BOM 单元格值编辑器',
        rowNumberHeader: '行号',
        contextMenu: {
          'column.insert-before': '在左侧插入列',
          'column.insert-after': '在右侧插入列',
          'column.delete': '删除列',
          'column.hide': '隐藏列',
          'column.freeze-start': '冻结到左侧',
          'column.freeze-end': '冻结到右侧',
          'column.unfreeze': '取消冻结',
          'column.sort-asc': '升序排序',
          'column.sort-desc': '降序排序',
          'column.filter-current': '按当前值筛选',
          'column.clear-sort-filter': '清除排序和筛选',
          'column.clear-format': '清除列格式',
          'column.copy': '复制选区',
          'column.clear-content': '清除列内容',
          'row.clear-content': '清除行内容',
          'row.insert-sibling': '插入同级行',
          'row.insert-child': '插入子级行',
          'row.delete': '删除行',
          'row.move-up': '上移',
          'row.move-down': '下移',
          'row.indent': '增加缩进',
          'row.outdent': '减少缩进',
          'row.expand-all': '全部展开',
          'row.collapse-all': '全部折叠',
        },
      },
      theme: {
        font:
          String(scenario.font.weight) +
          ' ' +
          String(scenario.font.sizePx) +
          'px ' +
          scenario.font.family,
      },
      formatCellText(context): string | undefined {
        if (context.column.columnId === 'materialCode') {
          return materialCodeByOccurrence.get(context.occurrenceId) ?? '';
        }
        return undefined;
      },
    },
  });

  editor.on('ready', () => {
    refreshStatus();
  });
  editor.on('capabilitiesChanged', () => {
    refreshStatus();
  });
  editor.on('transactionCommitted', (event) => {
    refreshStatus();
    setSession('已提交 ' + event.origin, 'ready');
  });
  editor.on('transactionRejected', (event) => {
    setSession('事务未提交 / ' + event.error.code, 'error');
  });
  editor.on('documentReplaced', () => {
    refreshStatus();
  });
  let activeColumnId: string | null = null;
  editor.on('selectionChanged', (event) => {
    activeColumnId = event.selection.activeCell?.columnId ?? null;
  });
  editor.on('error', (event) => {
    setSession('运行错误 / ' + event.error.code, 'error');
  });
  editor.on('clipboardOperation', (event) => {
    if (event.operation !== 'copy') return;
    setSession(
      event.outcome === 'written'
        ? '已复制选中区域'
        : '复制未完成 / ' + (event.reasonCode ?? 'BOM_CLIPBOARD_WRITE_FAILED'),
      event.outcome === 'written' ? 'ready' : 'error',
    );
  });
  editor.on('pasteOperation', (event) => {
    refreshStatus();
    setSession(
      event.outcome === 'committed'
        ? '已粘贴 ' + String(event.targetCellCount ?? 0) + ' 个单元格'
        : '粘贴未完成 / ' + (event.reasonCode ?? 'BOM_PASTE_FAILED'),
      event.outcome === 'committed' ? 'ready' : 'error',
    );
  });
  editor.on('destroyed', () => {
    setSession('编辑器已销毁', 'error');
  });

  undoButton.addEventListener('click', () => {
    void runAction('撤销', () =>
      editor.undo({ origin: 'demo:toolbar:undo' }),
    );
  });
  redoButton.addEventListener('click', () => {
    void runAction('重做', () =>
      editor.redo({ origin: 'demo:toolbar:redo' }),
    );
  });
  reloadButton.addEventListener('click', () => {
    void runAction('重载 10K', () => editor.setDocument(fixture.snapshot));
  });
  scenarioButton.addEventListener('click', () => {
    void runAction('规范编辑场景', () =>
      editor.execute(
        {
          type: 'setField',
          occurrenceId: targetNode.occurrenceId,
          fieldPath: targetField.path,
          value: scenario.interaction.replacementText,
        },
        { origin: 'demo:' + scenario.id },
      ),
    );
  });
  findButton.addEventListener('click', openFindPanel);
  columnSettingsButton.addEventListener('click', openColumnSettings);
  columnSettingsCloseButton.addEventListener('click', () => closeToolPanel(columnSettingsPanel));
  columnSettingsApply.addEventListener('click', applyColumnSettings);
  columnFieldNameInput.addEventListener('input', refreshColumnFieldPathPreview);
  columnFormatSelect.addEventListener('change', () => {
    syncColumnFormatOptions(columnFormatSelect.value);
    refreshColumnFormatPreview();
  });
  for (const control of [
    columnMinimumFraction,
    columnMaximumFraction,
    columnGroupingCheckbox,
    columnUnitDisplay,
    columnDateStyleSelect,
    columnTimeStyleSelect,
    columnFractionDenominatorSelect,
    columnFractionGroupingCheckbox,
    columnCurrencySelect,
  ]) {
    control.addEventListener('input', refreshColumnFormatPreview);
    control.addEventListener('change', refreshColumnFormatPreview);
  }
  for (const button of columnAlignmentButtons) {
    button.addEventListener('click', () => {
      const alignment = button.dataset['columnAlignment'];
      if (alignment === 'start' || alignment === 'center' || alignment === 'end') {
        setColumnAlignment(alignment);
      }
    });
  }
  findCloseButton.addEventListener('click', closeFindPanel);
  shortcutsButton.addEventListener('click', () => {
    const opening = shortcutsPanel.hidden;
    closeCommandMore();
    closeFindPanel();
    shortcutsPanel.hidden = !opening;
  });
  shortcutsCloseButton.addEventListener('click', () => closeToolPanel(shortcutsPanel));
  freezeStartButton.addEventListener('click', () => setActiveColumnFrozen('start'));
  freezeEndButton.addEventListener('click', () => setActiveColumnFrozen('end'));
  unfreezeButton.addEventListener('click', () => setActiveColumnFrozen(false));
  findForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (hasCurrentFindResults()) {
      focusFindTarget(findCurrentIndex + 1);
    } else {
      void runFind();
    }
  });
  findPreviousButton.addEventListener('click', () => focusFindTarget(findCurrentIndex - 1));
  findNextButton.addEventListener('click', () => focusFindTarget(findCurrentIndex + 1));
  findInput.addEventListener('input', invalidateFindResults);
  findMode.addEventListener('change', invalidateFindResults);
  findCaseSensitive.addEventListener('change', invalidateFindResults);
  findMatchWholeCell.addEventListener('change', invalidateFindResults);
  findInput.addEventListener('keydown', (event) => {
    if (event.isComposing || event.key !== 'Enter') return;
    event.preventDefault();
    if (hasCurrentFindResults()) {
      focusFindTarget(findCurrentIndex + (event.shiftKey ? -1 : 1));
    } else {
      void runFind();
    }
  });
  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      openFindPanel();
      return;
    }
    if (event.key === 'Escape' && !findPanel.hidden) {
      event.preventDefault();
      closeFindPanel();
    }
  });

  function openFindPanel(): void {
    closeCommandMore();
    closeToolPanel(shortcutsPanel);
    findPanel.hidden = false;
    findInput.focus({ preventScroll: true });
  }

  function closeFindPanel(): void {
    findPanel.hidden = true;
    invalidateFindResults();
  }

  function openColumnSettings(): void {
    closeCommandMore();
    closeFindPanel();
    closeToolPanel(shortcutsPanel);
    const column = activeColumnId === null
      ? undefined
      : columns.find((candidate) => candidate.columnId === activeColumnId);
    if (column === undefined) {
      columnSettingsColumn.textContent = '先选择一个单元格';
      columnLabelInput.value = '';
      columnLabelInput.disabled = true;
      columnFieldNameInput.value = '';
      columnFieldNameInput.disabled = true;
      columnFieldNameHint.textContent = '先选择一个单元格后再设置属性名称。';
      setColumnFieldPath('--', true);
      columnFormatPreview.textContent = '--';
      columnFormatPreview.parentElement?.setAttribute('data-state', 'empty');
      columnSettingsButton.focus({ preventScroll: true });
    } else {
      const bindingLocked = rendererMetadataColumnIds.has(column.columnId);
      columnSettingsColumn.textContent = '当前列：' + column.label;
      columnLabelInput.value = column.label;
      columnLabelInput.disabled = false;
      columnFieldNameInput.value = column.fieldName ?? '';
      columnFieldNameInput.disabled = bindingLocked;
      columnFieldNameHint.textContent = bindingLocked
        ? '渲染器元数据列，属性绑定固定，不能改绑到 Schema 字段。'
        : '使用 Schema 中定义的 fieldId；应用时会同步更新绑定路径。';
      setColumnFieldPath(column.fieldPath.join('.'), false);
      loadColumnFormat(column.format);
      setColumnAlignment(column.alignment ?? 'start');
      columnWrapCheckbox.checked = column.wrapText === true;
    }
    columnSettingsPanel.hidden = false;
  }

  function closeCommandMore(): void {
    commandMore.open = false;
  }

  function applyColumnSettings(): void {
    if (activeColumnId === null) {
      setSession('请先选择需要设置的列', 'error');
      return;
    }
    const current = columns.find((candidate) => candidate.columnId === activeColumnId);
    if (current === undefined) return;
    const label = columnLabelInput.value.trim();
    if (label.length === 0) {
      setSession('显示名称不能为空', 'error');
      columnLabelInput.focus({ preventScroll: true });
      return;
    }
    const bindingLocked = rendererMetadataColumnIds.has(current.columnId);
    const fieldName = bindingLocked
      ? current.fieldName
      : columnFieldNameInput.value.trim();
    const field = fieldName === undefined
      ? undefined
      : schemaFieldById.get(fieldName);
    if (field === undefined) {
      setColumnFieldPath('未找到 Schema 属性', true);
      setSession('属性名称不存在于 Schema: ' + (fieldName ?? '(空)'), 'error');
      if (!bindingLocked) columnFieldNameInput.focus({ preventScroll: true });
      return;
    }
    const format = selectedColumnFormat();
    if (format === null) {
      refreshColumnFormatPreview();
      setSession('小数位设置无效', 'error');
      return;
    }
    refreshColumnFormatPreview();
    const next = Object.freeze(columns.map((column) =>
      column.columnId === activeColumnId
        ? Object.freeze({
            ...column,
            fieldName: field.fieldId,
            fieldPath: Object.freeze([...field.path]),
            label,
            format,
            alignment: selectedColumnAlignment,
            wrapText: columnWrapCheckbox.checked,
            ...(column.a11y?.label === current.label
              ? { a11y: Object.freeze({ ...column.a11y, label }) }
              : {}),
          })
        : column,
    ));
    const result = editor.setColumns(next);
    if (!result.ok) {
      setSession('列设置未完成 / ' + result.error.code, 'error');
      return;
    }
    columns = next;
    columnSettingsColumn.textContent = '当前列：' + label;
    setColumnFieldPath(field.path.join('.'), false);
    setSession('已应用列名称、属性绑定和显示格式', 'ready');
  }

  function refreshColumnFieldPathPreview(): void {
    if (columnFieldNameInput.disabled) return;
    const field = schemaFieldById.get(columnFieldNameInput.value.trim());
    setColumnFieldPath(
      field === undefined ? '未找到 Schema 属性' : field.path.join('.'),
      field === undefined,
    );
  }

  function setColumnFieldPath(value: string, invalid: boolean): void {
    columnFieldPath.textContent = value;
    columnFieldPath.parentElement?.setAttribute(
      'data-state',
      invalid ? 'error' : 'ready',
    );
  }

  function loadColumnFormat(
    format: BomColumnDefinition['format'],
  ): void {
    const resolved = format ?? { kind: 'text' as const };
    columnFormatSelect.value = resolved.kind;
    columnMinimumFraction.value = String(
      resolved.kind === 'decimal' || resolved.kind === 'percent' || resolved.kind === 'currency' ||
      resolved.kind === 'accounting' || resolved.kind === 'scientific'
        ? (resolved.minimumFractionDigits ?? 0)
        : 0,
    );
    columnMaximumFraction.value = String(
      resolved.kind === 'decimal' || resolved.kind === 'percent' || resolved.kind === 'currency' ||
      resolved.kind === 'accounting' || resolved.kind === 'scientific'
        ? (resolved.maximumFractionDigits ?? 2)
        : 2,
    );
    columnGroupingCheckbox.checked = resolved.kind === 'integer' || resolved.kind === 'decimal' ||
      resolved.kind === 'accounting'
      ? resolved.useGrouping !== false
      : true;
    columnUnitDisplay.value = resolved.kind === 'decimal' && resolved.unit === 'hidden'
      ? 'hidden'
      : 'preserve';
    columnDateStyleSelect.value = resolved.kind === 'date' || resolved.kind === 'datetime'
      ? resolved.dateStyle ?? 'short'
      : 'short';
    columnTimeStyleSelect.value = resolved.kind === 'datetime'
      ? resolved.timeStyle ?? 'short'
      : 'short';
    columnFractionDenominatorSelect.value = resolved.kind === 'fraction'
      ? String(resolved.maximumDenominator ?? 100)
      : '100';
    columnFractionGroupingCheckbox.checked = resolved.kind === 'fraction'
      ? resolved.useGrouping !== false
      : true;
    columnCurrencySelect.value = resolved.kind === 'currency' || resolved.kind === 'accounting'
      ? resolved.currency
      : 'CNY';
    syncColumnFormatOptions(resolved.kind);
    refreshColumnFormatPreview();
  }

  function syncColumnFormatOptions(kind: string): void {
    const hasFractions = kind === 'decimal' || kind === 'percent' || kind === 'currency' ||
      kind === 'accounting' || kind === 'scientific';
    const hasGrouping = kind === 'integer' || kind === 'decimal' || kind === 'accounting';
    columnNumberOptions.hidden = !(hasFractions || hasGrouping);
    columnGroupingControl.hidden = !hasGrouping;
    columnUnitControl.hidden = kind !== 'decimal';
    columnDateOptions.hidden = kind !== 'date' && kind !== 'datetime';
    columnTimeStyleControl.hidden = kind !== 'datetime';
    columnFractionOptions.hidden = kind !== 'fraction';
    columnCurrencyOptions.hidden = kind !== 'currency' && kind !== 'accounting';
  }

  function selectedColumnFormat(): Exclude<BomColumnDefinition['format'], undefined> | null {
    const kind = columnFormatSelect.value;
    const minimumFractionDigits = Number(columnMinimumFraction.value);
    const maximumFractionDigits = Number(columnMaximumFraction.value);
    const validFractionDigits = Number.isSafeInteger(minimumFractionDigits) &&
      Number.isSafeInteger(maximumFractionDigits) &&
      minimumFractionDigits >= 0 && maximumFractionDigits >= minimumFractionDigits &&
      maximumFractionDigits <= 20;
    switch (kind) {
      case 'text':
        return Object.freeze({ kind: 'text' });
      case 'date':
        return Object.freeze({
          kind,
          dateStyle: columnDateStyleSelect.value as 'short' | 'medium' | 'long' | 'full',
        });
      case 'datetime':
        return Object.freeze({
          kind,
          dateStyle: columnDateStyleSelect.value as 'short' | 'medium' | 'long' | 'full',
          timeStyle: columnTimeStyleSelect.value as 'short' | 'medium' | 'long',
        });
      case 'integer':
        return Object.freeze({ kind, useGrouping: columnGroupingCheckbox.checked });
      case 'decimal':
        return validFractionDigits
          ? Object.freeze({
              kind,
              minimumFractionDigits,
              maximumFractionDigits,
              useGrouping: columnGroupingCheckbox.checked,
              unit: columnUnitDisplay.value === 'hidden' ? 'hidden' as const : 'preserve' as const,
            })
          : null;
      case 'percent':
        return validFractionDigits
          ? Object.freeze({ kind, minimumFractionDigits, maximumFractionDigits })
          : null;
      case 'currency':
        return validFractionDigits
          ? Object.freeze({
              kind,
              currency: columnCurrencySelect.value,
              minimumFractionDigits,
              maximumFractionDigits,
            })
          : null;
      case 'accounting':
        return validFractionDigits
          ? Object.freeze({
              kind,
              currency: columnCurrencySelect.value,
              minimumFractionDigits,
              maximumFractionDigits,
              useGrouping: columnGroupingCheckbox.checked,
            })
          : null;
      case 'scientific':
        return validFractionDigits
          ? Object.freeze({ kind, minimumFractionDigits, maximumFractionDigits })
          : null;
      case 'fraction': {
        const maximumDenominator = Number(columnFractionDenominatorSelect.value);
        return Number.isSafeInteger(maximumDenominator) &&
            maximumDenominator >= 2 && maximumDenominator <= 1000
          ? Object.freeze({
              kind,
              maximumDenominator,
              useGrouping: columnFractionGroupingCheckbox.checked,
            })
          : null;
      }
      default:
        return null;
    }
  }

  function refreshColumnFormatPreview(): void {
    const format = selectedColumnFormat();
    if (format === null) {
      columnFormatPreview.textContent = '参数无效';
      columnFormatPreview.parentElement?.setAttribute('data-state', 'error');
      return;
    }
    columnFormatPreview.textContent = formatColumnPreview(format);
    columnFormatPreview.parentElement?.setAttribute('data-state', 'ready');
  }

  function formatColumnPreview(
    format: Exclude<BomColumnDefinition['format'], undefined>,
  ): string {
    const sampleNumber = 12345.678;
    try {
      switch (format.kind) {
        case 'text':
          return 'BOM-1001';
        case 'integer':
          return new Intl.NumberFormat('zh-CN', {
            maximumFractionDigits: 0,
            useGrouping: format.useGrouping,
          }).format(sampleNumber);
        case 'decimal': {
          const text = new Intl.NumberFormat('zh-CN', {
            minimumFractionDigits: format.minimumFractionDigits,
            maximumFractionDigits: format.maximumFractionDigits,
            useGrouping: format.useGrouping,
          }).format(sampleNumber);
          return format.unit === 'hidden' ? text : text + ' kg';
        }
        case 'percent':
          return new Intl.NumberFormat('zh-CN', {
            style: 'percent',
            minimumFractionDigits: format.minimumFractionDigits,
            maximumFractionDigits: format.maximumFractionDigits,
          }).format(0.125);
        case 'currency':
          return new Intl.NumberFormat('zh-CN', {
            style: 'currency',
            currency: format.currency,
            minimumFractionDigits: format.minimumFractionDigits,
            maximumFractionDigits: format.maximumFractionDigits,
          }).format(sampleNumber);
        case 'accounting':
          return new Intl.NumberFormat('zh-CN', {
            style: 'currency',
            currency: format.currency,
            currencySign: 'accounting',
            minimumFractionDigits: format.minimumFractionDigits,
            maximumFractionDigits: format.maximumFractionDigits,
            useGrouping: format.useGrouping,
          }).format(-sampleNumber);
        case 'scientific':
          return new Intl.NumberFormat('zh-CN', {
            notation: 'scientific',
            minimumFractionDigits: format.minimumFractionDigits,
            maximumFractionDigits: format.maximumFractionDigits,
          }).format(sampleNumber);
        case 'fraction':
          return formatFractionPreview(
            sampleNumber,
            format.maximumDenominator ?? 100,
            format.useGrouping,
          );
        case 'date':
        case 'datetime': {
          const sampleDate = new Date(2024, 5, 15, 13, 45, 30);
          return new Intl.DateTimeFormat(
            'zh-CN',
            format.kind === 'date'
              ? { dateStyle: format.dateStyle ?? 'short' }
              : {
                  dateStyle: format.dateStyle ?? 'short',
                  timeStyle: format.timeStyle ?? 'short',
                },
          ).format(sampleDate);
        }
      }
    } catch {
      return '无法预览';
    }
  }

  function formatFractionPreview(
    value: number,
    maximumDenominator: number,
    useGrouping: boolean | undefined,
  ): string {
    const negative = value < 0;
    let absolute = Math.abs(value);
    let whole = Math.floor(absolute);
    const approximation = approximateFractionPreview(
      absolute - whole,
      maximumDenominator,
    );
    whole += Math.floor(approximation.numerator / approximation.denominator);
    const numerator = approximation.numerator % approximation.denominator;
    const wholeText = new Intl.NumberFormat('zh-CN', {
      maximumFractionDigits: 0,
      useGrouping,
    }).format(whole);
    const sign = negative && (whole !== 0 || numerator !== 0) ? '-' : '';
    if (numerator === 0) return sign + wholeText;
    const fractionText = String(numerator) + '/' + String(approximation.denominator);
    return whole === 0 ? sign + fractionText : sign + wholeText + ' ' + fractionText;
  }

  function approximateFractionPreview(
    value: number,
    maximumDenominator: number,
  ): Readonly<{ numerator: number; denominator: number }> {
    if (value <= Number.EPSILON) return Object.freeze({ numerator: 0, denominator: 1 });
    let previousNumerator = 0;
    let currentNumerator = 1;
    let previousDenominator = 1;
    let currentDenominator = 0;
    let remainder = value;
    for (let iteration = 0; iteration < 64; iteration += 1) {
      const coefficient = Math.floor(remainder);
      const nextNumerator = coefficient * currentNumerator + previousNumerator;
      const nextDenominator = coefficient * currentDenominator + previousDenominator;
      if (nextDenominator > maximumDenominator) {
        const multiplier = currentDenominator === 0
          ? 0
          : Math.floor((maximumDenominator - previousDenominator) / currentDenominator);
        const boundedNumerator = previousNumerator + multiplier * currentNumerator;
        const boundedDenominator = previousDenominator + multiplier * currentDenominator;
        return Object.freeze(
          Math.abs(value - boundedNumerator / boundedDenominator) <
              Math.abs(value - currentNumerator / currentDenominator)
            ? { numerator: boundedNumerator, denominator: boundedDenominator }
            : { numerator: currentNumerator, denominator: currentDenominator },
        );
      }
      previousNumerator = currentNumerator;
      currentNumerator = nextNumerator;
      previousDenominator = currentDenominator;
      currentDenominator = nextDenominator;
      const fractionalPart = remainder - coefficient;
      if (fractionalPart <= Number.EPSILON) break;
      remainder = 1 / fractionalPart;
    }
    return Object.freeze({ numerator: currentNumerator, denominator: currentDenominator });
  }

  function setColumnAlignment(alignment: 'start' | 'center' | 'end'): void {
    selectedColumnAlignment = alignment;
    for (const button of columnAlignmentButtons) {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset['columnAlignment'] === alignment),
      );
    }
  }

  function closeToolPanel(panel: HTMLElement): void {
    panel.hidden = true;
  }

  function setActiveColumnFrozen(frozen: 'start' | 'end' | false): void {
    if (activeColumnId === null) {
      setSession('请先选择需要冻结的列', 'error');
      return;
    }
    const result = editor.setColumnFrozen(activeColumnId, frozen);
    if (!result.ok) {
      setSession('列冻结未完成 / ' + result.error.code, 'error');
      return;
    }
    setSession(
      frozen === 'start' ? '当前列已冻结到左侧' : frozen === 'end' ? '当前列已冻结到右侧' : '当前列已取消冻结',
      'ready',
    );
  }

  type FindTarget = Readonly<{
    occurrenceId: string;
    columnId: string;
    reasons: readonly string[];
  }>;

  let findAbort: AbortController | null = null;
  let findTargets: readonly FindTarget[] = Object.freeze([]);
  let findCurrentIndex = -1;
  let findTotalMatches = 0;
  let findSearchKey: string | null = null;

  async function runFind(): Promise<void> {
    const query = findInput.value;
    if (query.trim().length === 0) {
      invalidateFindResults();
      findStatus.textContent = '请输入查询内容';
      return;
    }
    findAbort?.abort();
    const controller = new AbortController();
    const searchKey = currentFindSearchKey();
    findAbort = controller;
    resetFindNavigation();
    findStatus.textContent = '正在查找';
    const result = await editor.search(
      {
        query,
        mode: findMode.value as 'exact' | 'prefix' | 'fuzzy' | 'regex',
        caseSensitive: findCaseSensitive.checked,
        matchWholeCell: findMatchWholeCell.checked,
        limit: 10_000,
      },
      { signal: controller.signal },
    );
    if (findAbort !== controller || searchKey !== currentFindSearchKey()) return;
    findAbort = null;
    if (!result.ok) {
      findStatus.textContent = result.error.code === 'BOM_EDITOR_ABORTED'
        ? '查找已取消'
        : result.error.code === 'BOM_EDITOR_SEARCH_REGEX_INVALID'
          ? '正则表达式无效，或包含可能导致界面卡顿的写法'
          : '查找失败 / ' + result.error.code;
      return;
    }
    findSearchKey = searchKey;
    findTargets = Object.freeze(result.value.matches.map((match) => Object.freeze({
      occurrenceId: match.occurrenceId,
      columnId: columnForSearchReasons(match.reasons),
      reasons: match.reasons,
    })));
    findTotalMatches = result.value.totalMatches;
    if (findTargets.length === 0) {
      findStatus.textContent = '未找到匹配项';
      updateFindNavigation();
      return;
    }
    findStatus.textContent = result.value.truncated
      ? '找到 ' + integerFormat.format(result.value.totalMatches) + ' 项，已加载前 ' + integerFormat.format(findTargets.length) + ' 项'
      : '找到 ' + integerFormat.format(result.value.totalMatches) + ' 项';
    focusFindTarget(0);
  }

  function currentFindSearchKey(): string {
    return [
      findInput.value,
      findMode.value,
      String(findCaseSensitive.checked),
      String(findMatchWholeCell.checked),
    ].join('\u0000');
  }

  function hasCurrentFindResults(): boolean {
    return findSearchKey === currentFindSearchKey() && findTargets.length > 0;
  }

  function invalidateFindResults(): void {
    findAbort?.abort();
    findAbort = null;
    findSearchKey = null;
    resetFindNavigation();
    if (!findPanel.hidden) findStatus.textContent = '查询条件已变更，按 Enter 或点击查找';
  }

  function resetFindNavigation(): void {
    findTargets = Object.freeze([]);
    findCurrentIndex = -1;
    findTotalMatches = 0;
    updateFindNavigation();
  }

  function focusFindTarget(index: number): void {
    if (findTargets.length === 0) return;
    const focusOwner = document.activeElement instanceof HTMLElement
      && findPanel.contains(document.activeElement)
      ? document.activeElement
      : null;
    findCurrentIndex = ((index % findTargets.length) + findTargets.length) % findTargets.length;
    const target = findTargets[findCurrentIndex]!;
    const result = editor.focusCell(target);
    if (!result.ok) {
      setSession('无法定位查找结果 / ' + result.error.code, 'error');
      return;
    }
    updateFindNavigation();
    setSession('已定位查找结果', 'ready');
    if (focusOwner !== null) {
      focusOwner.focus({ preventScroll: true });
    } else {
      editor.focus();
    }
  }

  function updateFindNavigation(): void {
    const enabled = findTargets.length > 0;
    findPreviousButton.disabled = !enabled;
    findNextButton.disabled = !enabled;
    findCounter.value = enabled
      ? String(findCurrentIndex + 1) + ' / ' + integerFormat.format(findTotalMatches)
      : '0 / 0';
  }

  function columnForSearchReasons(reasons: readonly string[]): string {
    for (const reason of reasons) {
      const column = columns.find((candidate) => candidate.fieldPath[0] === reason);
      if (column !== undefined) return column.columnId;
    }
    return columns[0]!.columnId;
  }

  let actionRunning = false;
  async function runAction(
    label: string,
    action: () => Promise<
      | Awaited<ReturnType<typeof editor.execute>>
      | Awaited<ReturnType<typeof editor.setDocument>>
    >,
  ): Promise<void> {
    if (actionRunning) {
      return;
    }
    actionRunning = true;
    setControlsDisabled(true);
    setSession(label + ' 执行中', 'loading');
    const started = performance.now();
    try {
      const result = await action();
      const elapsed = performance.now() - started;
      setTiming(label, elapsed);
      if (!result.ok) {
        setSession(label + ' 未完成 / ' + result.error.code, 'error');
        return;
      }
      refreshStatus();
      setSession(label + ' 完成', 'ready');
    } catch (error) {
      console.error(error);
      setSession(label + ' 运行异常', 'error');
    } finally {
      actionRunning = false;
      setControlsDisabled(false);
    }
  }

  function refreshStatus(): void {
    const snapshot = editor.getSnapshot();
    const diagnostics = editor.getDiagnostics();
    const revision = snapshot.revision;
    revisionValue.textContent =
      'G' + String(diagnostics.documentGeneration) + ' / ' + shorten(revision);
    revisionValue.title = revision;
    nodeCountValue.textContent = integerFormat.format(snapshot.nodes.length);
    visibleCountValue.textContent = integerFormat.format(diagnostics.visibleRows);
    const capabilities = editor.capabilities;
    const capabilitySummary = [
      '后台线程：' + availability(capabilities.worker),
      '离屏画布：' + availability(capabilities.offscreenCanvas),
      '尺寸观察器：' + availability(capabilities.resizeObserver),
      '剪贴板：' + localizeClipboardCapability(capabilities.clipboard),
    ].join(' / ');
    capabilitiesValue.textContent = capabilitySummary;
    capabilitiesValue.title = capabilitySummary;
  }

  const mounted = await editor.mount(editorHost);
  if (!mounted.ok) {
    throw new Error(mounted.error.code);
  }
  const ready = await editor.ready;
  if (!ready.ok) {
    throw new Error(ready.error.code);
  }
  refreshStatus();
  setTiming('初始装载', performance.now() - startupStarted);
  editorHost.setAttribute('aria-busy', 'false');
  bootOverlay.hidden = true;
  setControlsDisabled(false);
  setSession('10K 文档已就绪', 'ready');
  window.addEventListener('beforeunload', () => editor.destroy(), {
    once: true,
  });
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error('BOM_DEMO_ELEMENT_MISSING_' + id);
  }
  return element as T;
}

function setControlsDisabled(disabled: boolean): void {
  for (const button of commandButtons) {
    button.disabled = disabled;
  }
}

function setSession(
  message: string,
  state: 'loading' | 'ready' | 'error',
): void {
  sessionStatus.textContent = message;
  sessionIndicator.dataset['state'] = state;
}

function setTiming(label: string, elapsed: number): void {
  timingValue.textContent = label + ' / ' + durationFormat.format(elapsed) + ' ms';
  timingValue.title = '单次墙钟耗时，不代表 P95 或 P99';
}

function availability(value: boolean): string {
  return value ? '可用' : '不可用';
}

function localizeColumnLabel(columnId: string, fallback: string): string {
  const known = COLUMN_LABELS[columnId as keyof typeof COLUMN_LABELS];
  if (known !== undefined) {
    return known;
  }
  const custom = /^custom(\d{2})$/u.exec(columnId);
  return custom === null ? fallback : `自定义字段 ${custom[1]}`;
}

function localizeClipboardCapability(value: string): string {
  switch (value) {
    case 'async':
      return '异步接口';
    case 'event':
      return '事件接口';
    default:
      return '不可用';
  }
}

function shorten(value: string): string {
  if (value.length <= 24) {
    return value;
  }
  return value.slice(0, 12) + '...' + value.slice(-8);
}

function formatBomValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (typeof value === 'object') {
    const record = value as Readonly<Record<string, unknown>>;
    if (
      (record['$type'] === 'decimal' || record['$type'] === 'integer') &&
      typeof record['value'] === 'string'
    ) {
      return record['$type'] === 'decimal' &&
        typeof record['unit'] === 'string'
        ? record['value'] + ' ' + record['unit']
        : record['value'];
    }
    return JSON.stringify(value);
  }
  return '';
}

function showFatalError(error: unknown): void {
  console.error(error);
  setControlsDisabled(true);
  editorHost.setAttribute('aria-busy', 'false');
  const message = bootOverlay.querySelector('strong');
  if (message !== null) {
    message.textContent = '编辑器初始化失败';
  }
  const loadingBar = bootOverlay.querySelector('.loading-bar');
  if (loadingBar instanceof HTMLElement) {
    loadingBar.hidden = true;
  }
  bootOverlay.hidden = false;
  setSession('初始化失败', 'error');
}
