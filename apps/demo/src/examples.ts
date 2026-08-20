import {
  createBomEditorComponent,
  type BomEditorComponent,
  type BomEditorComponentProps,
} from '@qkplm/bom-editor';
import { createBomEditorReactAdapter } from '@qkplm/bom-editor-react';
import { installBomEditorUmd } from '@qkplm/bom-editor-umd';
import { createBomEditorVueAdapter } from '@qkplm/bom-editor-vue';

interface CapabilityExampleDefinition {
  readonly id: string;
  readonly index: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly indexDetail: string;
  readonly overview: readonly Readonly<{
    label: string;
    title: string;
    description: string;
  }>[];
  readonly input: JsonRecord;
  readonly outputKind: string;
  readonly code: string;
}

const CAPABILITY_EXAMPLE_DEFINITIONS: readonly CapabilityExampleDefinition[] = Object.freeze([
  {
    id: 'selection',
    index: '06',
    eyebrow: '06 / RANGE & FILL',
    title: '选区与填充序列',
    description: '用稳定单元格地址恢复矩形选区，并在真实编辑器中演练填充柄和序列填充。',
    indexDetail: 'Range / Fill / Selection',
    overview: [
      { label: '选区', title: '稳定地址范围', description: '选区不依赖虚拟行索引，可在投影变化后恢复。' },
      { label: '填充', title: 'series / fill handle', description: '数值列使用首两行步长生成后续值，并作为单一事务提交。' },
      { label: '输出', title: 'selectionChanged', description: '选区和提交变化均经公开 outputs 回传。' },
    ],
    input: {
      selection: {
        anchor: { occurrenceId: 'occ-0001', columnId: 'quantity' },
        focus: { occurrenceId: 'occ-0042', columnId: 'quantity' },
      },
      action: 'fillSeries',
    },
    outputKind: 'selectionChanged / documentChange',
    code: "component.fillSeries();\n// 或拖动选区右下角填充柄，释放时生成一个原子 Commit。",
  },
  {
    id: 'structure',
    index: '07',
    eyebrow: '07 / STRUCTURE EDITING',
    title: '层级结构与拖拽移动',
    description: '在具有父子关系的真实 BOM 上演练行号拖拽、插入位置预览和键盘结构移动。',
    indexDetail: 'Tree / Drag / Keyboard',
    overview: [
      { label: '结构', title: '完整层级 Snapshot', description: '根节点、子节点和位置键均由规范 Snapshot 提供。' },
      { label: '交互', title: '拖拽或 Alt + 方向键', description: '拖动期间只显示预览，释放后才请求或提交结构变更。' },
      { label: '边界', title: '循环与后代拒绝', description: '自身和后代目标会在释放前被拒绝，不产生局部修改。' },
    ],
    input: {
      sourceOccurrenceId: 'occ-0007',
      targetOccurrenceId: 'occ-0024',
      position: 'inside',
      keyboard: ['Alt+ArrowUp', 'Alt+ArrowDown', 'Alt+ArrowLeft', 'Alt+ArrowRight'],
    },
    outputKind: 'documentChange / structureMoveRequest',
    code: "// 从行号区域拖动，或在 treegrid 聚焦时使用 Alt + 方向键。\n// 完整 Snapshot 直接提交；部分 Snapshot 输出 onStructureMoveRequest。",
  },
  {
    id: 'history',
    index: '08',
    eyebrow: '08 / HISTORY',
    title: '撤销、重做与批量事务',
    description: '以真实编辑器的历史预算、连续编辑和快捷键演练事务前后状态的恢复。',
    indexDetail: 'Undo / Redo / Batch',
    overview: [
      { label: '历史', title: '有界 Undo / Redo', description: '领域事务与交互视图历史分开保存，预算超限时确定性淘汰。' },
      { label: '连续编辑', title: 'Enter / Tab 导航', description: '提交后按编辑导航规则移动到下一可编辑单元格。' },
      { label: '批量', title: '单一原子 Commit', description: '填充、粘贴和结构批量操作不会拆成半提交。' },
    ],
    input: {
      history: { maxEntries: 100, maxBytes: 1048576 },
      shortcuts: ['Ctrl/Cmd+Z', 'Ctrl/Cmd+Y'],
      transaction: 'edit then undo then redo',
    },
    outputKind: 'documentChange / editEnd',
    code: "// 在实例中完成一次编辑后使用 Ctrl/Cmd + Z 与 Ctrl/Cmd + Y。\n// 输出中的 Commit 关联 revision、transactionId 与 origin。",
  },
  {
    id: 'query',
    index: '09',
    eyebrow: '09 / VISIBLE PROJECTION',
    title: '筛选、排序与可见投影',
    description: '通过公开 query 输入重建只读视图投影，不修改 BOM Snapshot 或领域 revision。',
    indexDetail: 'Filter / Sort / Projection',
    overview: [
      { label: '筛选', title: 'Schema fieldPath', description: '每个规则显式绑定字段路径、运算符和规范值。' },
      { label: '排序', title: '稳定同级排序', description: '排序仅改变可见投影，层级和数据不被就地重排。' },
      { label: '输出', title: 'viewChanged', description: '宿主可以保存 query 与列状态，不必读取 renderer 内部状态。' },
    ],
    input: {
      query: {
        filters: [{ fieldPath: ['name'], operator: 'contains', value: '泵' }],
        sort: [{ fieldPath: ['specification', 'quantity'], direction: 'desc' }],
      },
    },
    outputKind: 'viewChanged',
    code: "const result = component.setViewQuery({\n  filters: [{ fieldPath: ['name'], operator: 'contains', value: '泵' }],\n  sort: [{ fieldPath: ['specification', 'quantity'], direction: 'desc' }],\n});",
  },
  {
    id: 'columns',
    index: '10',
    eyebrow: '10 / COLUMN COMMANDS',
    title: '列插入、删除与冻结',
    description: '演练可逆的列几何和列集合变化，所有操作都由稳定 columnId 驱动。',
    indexDetail: 'Insert / Delete / Freeze',
    overview: [
      { label: '冻结', title: 'start / end / false', description: '冻结是视图状态，不修改 BOM 字段值或数据顺序。' },
      { label: '列集合', title: 'insert / delete', description: '插入和删除使用列 ID，受首列与最小可见列约束保护。' },
      { label: '可撤销', title: 'view history', description: '列几何操作进入交互历史，领域 revision 保持不变。' },
    ],
    input: {
      freeze: { columnId: 'quantity', frozen: 'end' },
      insert: { referenceColumnId: 'quantity', position: 'after', count: 1 },
      deleteColumnIds: [],
    },
    outputKind: 'viewChanged',
    code: "component.setColumnFrozen('quantity', 'end');\ncomponent.insertColumn('quantity', 'after', 1);\ncomponent.deleteColumns(['new-column-id']);",
  },
  {
    id: 'templates',
    index: '11',
    eyebrow: '11 / VIEW TEMPLATE',
    title: '视图模板保存与应用',
    description: '获取当前列定义和 query 组成的纯前端模板，再应用到同一受控实例。',
    indexDetail: 'Template / Query / Columns',
    overview: [
      { label: '读取', title: 'getViewTemplate', description: '模板只包含列定义与可见投影 query，不含业务数据。' },
      { label: '应用', title: 'applyViewTemplate', description: '模板经过列和 Schema 校验后才替换当前视图。' },
      { label: '宿主', title: '存储可选', description: '持久化由宿主选择本地存储或自己的前端状态容器。' },
    ],
    input: {
      operation: 'capture-and-apply',
      templateName: '采购视图',
    },
    outputKind: 'viewTemplate / viewChanged',
    code: "const template = component.getViewTemplate();\nconst result = component.applyViewTemplate(template);\n// 宿主可将 template 序列化为自己的前端状态。",
  },
  {
    id: 'validation',
    index: '12',
    eyebrow: '12 / VALIDATION',
    title: '校验与问题诊断',
    description: '对当前文档、可见行或选区运行异步校验，并观察无值诊断输出。',
    indexDetail: 'Validate / Diagnostics / Issues',
    overview: [
      { label: '范围', title: 'document / visible / selection', description: '校验范围由公开参数声明，结果与当前 revision 绑定。' },
      { label: '诊断', title: 'validationChanged', description: 'UI 显示问题数量和定位信息，输出不泄露原始字段内容。' },
      { label: '修复', title: '宿主批准边界', description: '自动修复提案需要显式审阅和受控提交。' },
    ],
    input: { scope: 'document' },
    outputKind: 'validation report / validationChanged',
    code: "const report = await component.validate({ scope: 'document' });\nif (report.ok) renderIssues(report.value.issues);",
  },
  {
    id: 'matching',
    index: '13',
    eyebrow: '13 / MATERIAL MATCHING',
    title: '物料智能匹配与采纳',
    description: '在当前 Snapshot 上执行确定性物料匹配，输出候选、得分和选择状态。',
    indexDetail: 'Match / Score / Approval',
    overview: [
      { label: '检索', title: 'exact / prefix / fuzzy', description: '匹配综合物料编码、字段、别名和可选的确定性分词规则。' },
      { label: '结果', title: 'score + confidence', description: '候选按稳定规则排序，并给出可审查的分项得分。' },
      { label: '采纳', title: 'proposal + approval', description: '应用候选必须先取得精确提案并经过宿主批准策略。' },
    ],
    input: {
      query: 'PUMP',
      limit: 5,
      targetOccurrenceId: 'occ-0024',
      selection: { minConfidence: 0.4, minScoreDelta: 0.05 },
    },
    outputKind: 'materialMatchResult / materialMatchAudit',
    code: "const matches = await component.matchMaterials({ query: 'PUMP', limit: 5 });\nconst proposal = component.proposeMaterialMatch('occ-0024', matches.value.matches[0]);\nif (proposal.ok) await component.applyMaterialMatch(proposal.value);",
  },
  {
    id: 'diff',
    index: '14',
    eyebrow: '14 / CONTROLLED UPDATE',
    title: '受控更新与 Diff 预览',
    description: '使用受控 document 与值无关 Diff 覆盖层演练宿主回显，不读取内部模型。',
    indexDetail: 'Update / Diff / Controlled',
    overview: [
      { label: '更新', title: 'component.update', description: '宿主提供下一份规范 Snapshot，组件按 generation 和 revision 重新绑定。' },
      { label: '标记', title: 'setDiffView', description: 'Diff 只携带稳定 ID、列 ID 和变更种类，不传输字段原值。' },
      { label: '输出', title: 'documentReplaced', description: '新文档身份通过输出回传，供宿主绑定后续 view 状态。' },
    ],
    input: {
      changedOccurrenceId: 'occ-0001',
      changedColumnId: 'name',
      kind: 'changed',
      nextRevision: '2',
    },
    outputKind: 'documentReplaced / viewChanged',
    code: "component.setDiffView(diffView);\nawait component.update({ document: nextSnapshot, diffView });",
  },
  {
    id: 'exchange',
    index: '15',
    eyebrow: '15 / IMPORT & EXPORT',
    title: 'CSV/XLSX 导入与三种导出',
    description: '用浏览器 Blob 演练 CSV 预览导入、导出授权和 currentView/completeData/template 模式。',
    indexDetail: 'Import / Export / Progress',
    overview: [
      { label: '导入', title: 'preview before commit', description: 'CSV/TSV/XLSX 先解析映射并返回报告，不会隐式覆盖文档。' },
      { label: '导出', title: 'policy protected', description: '导出请求明确说明模式、行范围和字段，宿主授权后生成 Blob。' },
      { label: '任务', title: 'taskProgress', description: '长操作的进度和错误均通过公开输出回传。' },
    ],
    input: {
      csv: 'materialCode,name,quantity\nPUMP-101,备用泵,2',
      import: { format: 'csv', mode: 'preview', header: 'firstRow', fieldIds: ['materialCode', 'name', 'quantity'] },
      exports: [
        { format: 'csv', mode: 'currentView', rowScope: 'visible', fieldIds: ['materialCode', 'name', 'quantity'] },
        { format: 'csv', mode: 'completeData', rowScope: 'all', fieldIds: ['materialCode', 'name', 'quantity'] },
        { format: 'csv', mode: 'roundTripTemplate', rowScope: 'all', fieldIds: ['materialCode', 'name', 'quantity'] },
      ],
    },
    outputKind: 'importReport / exportResult / taskProgress',
    code: "const report = await component.importData(new Blob([csv]), importOptions);\nconst files = await Promise.all(exportOptions.map((options) => component.exportData(options)));\n// currentView / completeData / roundTripTemplate 都经过同一导出授权策略。",
  },
  {
    id: 'presentation',
    index: '16',
    eyebrow: '16 / A11Y & PRESENTATION',
    title: '快捷键、主题与读屏播报',
    description: '配置快捷键、locale、方向和主题，并通过公开 announce API 写入无障碍 Live Region。',
    indexDetail: 'Shortcut / Locale / A11y',
    overview: [
      { label: '快捷键', title: '冲突诊断与重置', description: '注册表校验作用域、优先级和冲突，失败不会半应用。' },
      { label: '展示', title: 'locale / direction / theme', description: '展示配置不修改数据，支持 RTL、高对比和系统偏好。' },
      { label: '读屏', title: 'polite / assertive', description: '播报只接受本地化纯文本，不能把原始 BOM 值带入。' },
    ],
    input: {
      locale: 'zh-CN',
      direction: 'ltr',
      theme: 'highContrast',
      zoom: 1.15,
      announcement: '示例编辑器已更新视图。',
      shortcuts: {
        sequenceTimeoutMs: 1000,
        bindings: [{ id: 'demo-focus-search', keys: 'Primary+Shift+F', command: 'focus-search', scope: 'focused' }],
      },
    },
    outputKind: 'shortcut diagnostics / live announcement',
    code: "component.configureShortcuts(shortcuts);\ncomponent.configurePresentation({ locale, direction, theme: highContrastTheme });\ncomponent.announce({ message: '示例编辑器已更新视图。', politeness: 'polite' });\n// zoom 是宿主容器的浏览器呈现配置，不写入组件数据状态。",
  },
  {
    id: 'plugins',
    index: '17',
    eyebrow: '17 / EXTENSIBILITY',
    title: '插件权限与生命周期',
    description: '演练同源插件的安装、权限协商、状态读取和卸载，插件无法访问未被授予的能力。',
    indexDetail: 'Plugin / Permission / Lifecycle',
    overview: [
      { label: '清单', title: 'ABI + engine range', description: '插件需声明版本、ABI、能力和请求权限，未知能力会被拒绝。' },
      { label: '协商', title: 'explicit grants', description: '宿主的 grant policy 只返回被允许的最小权限集。' },
      { label: '回收', title: 'install / uninstall', description: '卸载会取消插件任务、调用清理逻辑并释放注册内容。' },
    ],
    input: {
      plugin: {
        id: 'demo-inspector',
        name: 'Demo inspector',
        version: '1.0.0',
        abiVersion: '1.0.0',
        engineRange: '*',
        capabilities: ['commands'],
        permissions: [],
      },
    },
    outputKind: 'plugin state / lifecycle result',
    code: "const installed = await component.installPlugin(plugin);\nconst state = component.getPlugins();\nawait component.uninstallPlugin(plugin.manifest.id);",
  },
  {
    id: 'lifecycle',
    index: '18',
    eyebrow: '18 / MULTI-INSTANCE',
    title: '多实例焦点隔离与生命周期',
    description: '在同一页面挂载两个独立组件，演练焦点切换、unmount/mount、destroy 和替换实例。',
    indexDetail: 'Focus / Unmount / Destroy',
    overview: [
      { label: '隔离', title: '独立 instanceId', description: '两个编辑器的选区、焦点和 DOM 资源彼此独立。' },
      { label: '重挂载', title: 'unmount then mount', description: '卸载只释放视图资源，模型仍可重新挂载到原宿主。' },
      { label: '销毁', title: 'destroy then replace', description: '销毁后的实例不可复用，示例创建新的独立实例替代它。' },
    ],
    input: {
      primaryInstanceId: 'demo-primary',
      secondaryInstanceId: 'demo-secondary',
      replacementInstanceId: 'demo-secondary-replacement',
    },
    outputKind: 'focus / unmount / remount / destroy',
    code: "const first = createBomEditorComponent({ ...props, instanceId: 'demo-primary' });\nconst second = createBomEditorComponent({ ...props, instanceId: 'demo-secondary' });\nawait Promise.all([first.mount(primaryHost), second.mount(secondaryHost)]);\nfirst.unmount();\nawait first.mount(primaryHost);\nsecond.destroy();",
  },
  {
    id: 'frameworks',
    index: '19',
    eyebrow: '19 / SDK ONBOARDING',
    title: '原生、React 与 Vue 接入',
    description: '从公开 SDK 出口创建同一份 BOM 组件，并在浏览器中实际演练受控输入、输出、失败恢复和销毁重建。',
    indexDetail: 'Native / React / Vue / UMD',
    overview: [
      { label: '入口', title: '@qkplm/bom-editor + adapters', description: '切换 adapter 后仍只使用公开的 Props、Outputs、mount、update 与 destroy。' },
      { label: '恢复', title: '拒绝后受控 update', description: '先提交一份无效 Snapshot 并检查 BomResult，再传入下一份有效文档恢复。' },
      { label: '清理', title: 'unmount / destroy / recreate', description: '示例会重挂载、销毁当前实例，再创建替代实例，避免把已销毁实例复用。' },
    ],
    input: {
      adapter: 'react',
      instanceId: 'demo-framework-react',
      recoveryRevision: '2',
      lifecycle: { unmountRemount: true, destroyRecreate: true },
    },
    outputKind: 'ready / update error / recovery / destroy',
    code: "// 原生 HTML\nimport { createBomEditorComponent } from '@qkplm/bom-editor';\nconst component = createBomEditorComponent(props);\nconst mounted = await component.mount(host);\nif (!mounted.ok) report(mounted.error);\nconst recovered = await component.update({ document: nextSnapshot });\ncomponent.destroy();\n\n// React：在 useEffect 中 mount，在 cleanup 中 destroy。\nconst adapter = createBomEditorReactAdapter(props);\nawait adapter.mount(hostRef.current!);\nreturn () => adapter.destroy();\n\n// Vue：在 onMounted 中 mount，在 onBeforeUnmount 中 destroy。\nconst adapter = createBomEditorVueAdapter(props);\nonMounted(() => void adapter.mount(host.value!));\nonBeforeUnmount(() => adapter.destroy());\n\n// UMD：宿主显式安装命名空间，不隐式写入 window。\nconst api = installBomEditorUmd(window, { globalName: 'BomEditor', version: '1.0.0' });\nconst component = api.createBomEditorComponent(props);",
  },
]);

const CAPABILITY_EXAMPLE_BY_ID = new Map(
  CAPABILITY_EXAMPLE_DEFINITIONS.map((definition) => [definition.id, definition]),
);

registerCapabilityExamples();

function registerCapabilityExamples(): void {
  const index = document.querySelector<HTMLElement>('.example-index');
  const stage = document.querySelector<HTMLElement>('.example-stage');
  if (index === null || stage === null) return;
  const note = index.querySelector<HTMLElement>('.example-index-note');
  const existingCount = index.querySelectorAll('[data-example-target]').length;
  for (const definition of CAPABILITY_EXAMPLE_DEFINITIONS) {
    const indexItem = createCapabilityIndexItem(definition);
    if (note === null) index.append(indexItem);
    else index.insertBefore(indexItem, note);
    stage.append(createCapabilityExampleView(definition));
  }
  const count = document.querySelector<HTMLElement>('[data-example-count]');
  if (count !== null) {
    count.textContent = `${String(existingCount + CAPABILITY_EXAMPLE_DEFINITIONS.length)} 个公开 API 场景`;
  }
}

function createCapabilityIndexItem(
  definition: CapabilityExampleDefinition,
): HTMLButtonElement {
  const item = document.createElement('button');
  item.className = 'example-index-item';
  item.type = 'button';
  item.dataset['exampleTarget'] = definition.id;

  const number = document.createElement('span');
  number.className = 'example-index-number';
  number.textContent = definition.index;
  const detail = document.createElement('span');
  const title = document.createElement('strong');
  title.textContent = definition.title;
  const subtitle = document.createElement('small');
  subtitle.textContent = definition.indexDetail;
  detail.append(title, subtitle);
  item.append(number, detail);
  return item;
}

function createCapabilityExampleView(
  definition: CapabilityExampleDefinition,
): HTMLElement {
  const article = document.createElement('article');
  article.className = 'example-view';
  article.dataset['exampleView'] = definition.id;
  article.hidden = true;

  const header = document.createElement('header');
  header.className = 'example-view-header';
  const heading = document.createElement('div');
  const eyebrow = document.createElement('p');
  eyebrow.className = 'docs-eyebrow';
  eyebrow.textContent = definition.eyebrow;
  const title = document.createElement('h2');
  title.textContent = definition.title;
  const description = document.createElement('p');
  description.textContent = definition.description;
  heading.append(eyebrow, title, description);
  const status = document.createElement('span');
  status.className = 'example-status';
  status.dataset['exampleStatus'] = '';
  status.textContent = '可运行';
  header.append(heading, status);

  const tabs = document.createElement('div');
  tabs.className = 'example-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', `${definition.title}示例页签`);
  const overviewId = `${definition.id}-overview`;
  const inputId = `${definition.id}-input`;
  const outputId = `${definition.id}-output`;
  const codeId = `${definition.id}-code`;
  tabs.append(
    createCapabilityTab('说明', overviewId, true),
    createCapabilityTab('输入数据', inputId, false),
    createCapabilityTab('输出数据', outputId, false),
    createCapabilityTab('代码示例', codeId, false),
  );

  const overview = document.createElement('section');
  overview.className = 'example-panel is-active';
  overview.id = overviewId;
  overview.setAttribute('role', 'tabpanel');
  const overviewGrid = document.createElement('div');
  overviewGrid.className = 'overview-grid';
  for (const item of definition.overview) {
    const cell = document.createElement('div');
    const label = document.createElement('span');
    label.className = 'overview-label';
    label.textContent = item.label;
    const cellTitle = document.createElement('strong');
    cellTitle.textContent = item.title;
    const cellDescription = document.createElement('p');
    cellDescription.textContent = item.description;
    cell.append(label, cellTitle, cellDescription);
    overviewGrid.append(cell);
  }
  const host = document.createElement('div');
  host.className = 'example-editor-host';
  host.dataset['exampleEditorHost'] = definition.id;
  host.setAttribute('aria-label', `${definition.title}实例`);
  overview.append(overviewGrid, host, createRunButton(definition.id));

  const input = document.createElement('section');
  input.className = 'example-panel';
  input.id = inputId;
  input.hidden = true;
  input.setAttribute('role', 'tabpanel');
  const inputLabel = document.createElement('label');
  inputLabel.className = 'json-label';
  inputLabel.htmlFor = `${definition.id}-input-data`;
  inputLabel.textContent = '场景输入 JSON（可修改）';
  const textarea = document.createElement('textarea');
  textarea.className = 'json-editor';
  textarea.id = `${definition.id}-input-data`;
  textarea.dataset['exampleInput'] = definition.id;
  textarea.spellcheck = false;
  textarea.value = JSON.stringify(definition.input, null, 2);
  input.append(inputLabel, textarea, createRunButton(definition.id));

  const output = document.createElement('section');
  output.className = 'example-panel';
  output.id = outputId;
  output.hidden = true;
  output.setAttribute('role', 'tabpanel');
  const outputHeading = document.createElement('div');
  outputHeading.className = 'output-heading';
  const outputLabel = document.createElement('span');
  outputLabel.textContent = '当前输入和真实组件运行结果';
  const outputKind = document.createElement('span');
  outputKind.className = 'output-kind';
  outputKind.textContent = definition.outputKind;
  outputHeading.append(outputLabel, outputKind);
  const outputValue = document.createElement('pre');
  outputValue.className = 'json-output';
  outputValue.dataset['exampleOutput'] = definition.id;
  outputValue.textContent = '点击“运行示例”查看输出';
  output.append(outputHeading, outputValue);

  const code = document.createElement('section');
  code.className = 'example-panel';
  code.id = codeId;
  code.hidden = true;
  code.setAttribute('role', 'tabpanel');
  const codeHeading = document.createElement('div');
  codeHeading.className = 'code-heading';
  const language = document.createElement('span');
  language.textContent = 'TypeScript';
  const copy = document.createElement('button');
  copy.className = 'copy-code';
  copy.type = 'button';
  copy.dataset['copyCode'] = `${definition.id}-code-block`;
  copy.textContent = '复制代码';
  codeHeading.append(language, copy);
  const codeOutput = document.createElement('pre');
  codeOutput.className = 'code-output';
  codeOutput.id = `${definition.id}-code-block`;
  const codeValue = document.createElement('code');
  codeValue.textContent = definition.code;
  codeOutput.append(codeValue);
  code.append(codeHeading, codeOutput);

  article.append(header, tabs, overview, input, output, code);
  return article;
}

function createCapabilityTab(
  label: string,
  targetId: string,
  active: boolean,
): HTMLButtonElement {
  const tab = document.createElement('button');
  tab.className = active ? 'example-tab is-active' : 'example-tab';
  tab.type = 'button';
  tab.setAttribute('role', 'tab');
  tab.setAttribute('aria-selected', active ? 'true' : 'false');
  tab.setAttribute('aria-controls', targetId);
  tab.dataset['tabTarget'] = targetId;
  tab.textContent = label;
  return tab;
}

function createRunButton(exampleId: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'run-example';
  button.type = 'button';
  button.dataset['runExample'] = exampleId;
  button.textContent = '运行示例';
  return button;
}

const exampleViews = Array.from(
  document.querySelectorAll<HTMLElement>('[data-example-view]'),
);
const exampleIndexItems = Array.from(
  document.querySelectorAll<HTMLButtonElement>('[data-example-target]'),
);

const COMPONENT_OUTPUT_KEYS = new Set([
  'onDocumentChange',
  'onDocumentReplaced',
  'onStructureMoveRequest',
  'onSelectionChange',
  'onViewChange',
  'onEditStart',
  'onDraftChange',
  'onEditEnd',
  'onEditRejected',
  'onPaste',
  'onValidationChange',
  'onMaterialMatchAudit',
  'onClipboardCompleted',
  'onClipboardRejected',
  'onTaskProgress',
  'onError',
]);

const MOUNT_PROP_KEYS = new Set([
  'schema',
  'columns',
  'document',
  'diffView',
  'outputs',
  'instanceId',
  'protocolVersion',
  'initialView',
  'rowHeight',
  'expandedIds',
  'expandAll',
  'history',
  'clipboardPolicy',
  'exportPolicy',
  'pastePolicy',
  'pasteLimits',
  'editNavigation',
  'shortcuts',
  'plugins',
  'pluginGrantPolicy',
  'pluginHostConfiguration',
  'matchApprovalPolicy',
  'logger',
  'renderer',
]);

const embeddedEditorHosts = Array.from(
  document.querySelectorAll<HTMLDivElement>('[data-example-editor-host]'),
);
const scenarioOutputs = new Map<string, Readonly<Record<string, unknown>>>();
const embeddedRuntimeOutputs = new Map<string, Readonly<Record<string, unknown>>>();

type FrameworkAdapterKind = 'native' | 'react' | 'vue' | 'umd';

interface FrameworkRuntime {
  readonly kind: FrameworkAdapterKind;
  readonly component: BomEditorComponent;
  mount(container: HTMLElement): ReturnType<BomEditorComponent['mount']>;
  unmount(): ReturnType<BomEditorComponent['unmount']>;
  destroy(): void;
}

let activeEmbeddedEditor: BomEditorComponent | null = null;
let activeEmbeddedAuxiliaryEditors: readonly BomEditorComponent[] = [];
let activeFrameworkRuntime: FrameworkRuntime | null = null;
let embeddedMountGeneration = 0;
let embeddedMountTail: Promise<void> = Promise.resolve();

for (const item of exampleIndexItems) {
  item.addEventListener('click', () => {
    const target = item.dataset['exampleTarget'];
    if (target !== undefined) showExample(target);
  });
}

for (const view of exampleViews) {
  const tabs = Array.from(
    view.querySelectorAll<HTMLButtonElement>('[data-tab-target]'),
  );
  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      const target = tab.dataset['tabTarget'];
      if (target !== undefined) activateTab(view, target);
    });
  }
}

for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-run-example]'))) {
  button.addEventListener('click', () => {
    const exampleId = button.dataset['runExample'];
    if (exampleId !== undefined) void runExample(exampleId);
  });
}

for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-copy-code]'))) {
  button.addEventListener('click', () => {
    const codeId = button.dataset['copyCode'];
    const code = codeId === undefined
      ? undefined
      : document.getElementById(codeId)?.textContent;
    if (code === undefined || code.length === 0) return;
    const write = navigator.clipboard?.writeText(code);
    if (write === undefined) {
      button.textContent = '请允许剪贴板';
      return;
    }
    void write.then(
      () => {
        const original = button.textContent;
        button.textContent = '已复制';
        window.setTimeout(() => {
          button.textContent = original;
        }, 1_200);
      },
      () => {
        button.textContent = '复制失败';
      },
    );
  });
}

window.addEventListener('beforeunload', () => {
  embeddedMountGeneration += 1;
  destroyActiveEmbeddedEditors();
});

void mountEmbeddedEditor('mount');

function showExample(exampleId: string): void {
  for (const item of exampleIndexItems) {
    const active = item.dataset['exampleTarget'] === exampleId;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-current', active ? 'true' : 'false');
  }
  for (const view of exampleViews) {
    const active = view.dataset['exampleView'] === exampleId;
    view.classList.toggle('is-active', active);
    view.hidden = !active;
  }
  void mountEmbeddedEditor(exampleId);
}

function activateTab(view: HTMLElement, targetId: string): void {
  for (const tab of Array.from(view.querySelectorAll<HTMLButtonElement>('[data-tab-target]'))) {
    const active = tab.dataset['tabTarget'] === targetId;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  }
  for (const panel of Array.from(view.querySelectorAll<HTMLElement>('[role="tabpanel"]'))) {
    const active = panel.id === targetId;
    panel.classList.toggle('is-active', active);
    panel.hidden = !active;
  }
}

async function runExample(exampleId: string): Promise<void> {
  const input = document.querySelector<HTMLTextAreaElement>(
    `[data-example-input="${exampleId}"]`,
  );
  const output = document.querySelector<HTMLElement>(
    `[data-example-output="${exampleId}"]`,
  );
  const view = document.querySelector<HTMLElement>(
    `[data-example-view="${exampleId}"]`,
  );
  if (input === null || output === null || view === null) return;

  try {
    const value: unknown = JSON.parse(input.value);
    const result = buildExampleOutput(exampleId, value);
    scenarioOutputs.set(exampleId, result);
    embeddedRuntimeOutputs.delete(exampleId);
    renderExampleOutput(exampleId);
    const rejectedResult = result['status'] === 'rejected' || result['outcome'] === 'rejected';
    const component = await mountEmbeddedEditor(exampleId, value);
    if (component !== null && !rejectedResult) {
      await runLiveScenarioAction(exampleId, component, value);
    }
    setExampleStatus(
      view,
      component === null ? '挂载失败' : rejectedResult ? '已拒绝' : '已运行',
      component === null || rejectedResult ? 'error' : 'ready',
    );
  } catch (error) {
    scenarioOutputs.set(exampleId, {
      status: 'rejected',
      error: error instanceof Error ? error.message : '输入必须是合法 JSON',
    });
    renderExampleOutput(exampleId);
    setExampleStatus(view, '输入无效', 'error');
  }
  activateTab(view, `${exampleId}-output`);
}

function mountEmbeddedEditor(
  exampleId: string,
  suppliedInput?: unknown,
): Promise<BomEditorComponent | null> {
  const host = document.querySelector<HTMLDivElement>(
    `[data-example-editor-host="${exampleId}"]`,
  );
  const view = document.querySelector<HTMLElement>(
    `[data-example-view="${exampleId}"]`,
  );
  if (host === null || view === null) return Promise.resolve(null);

  const requestId = ++embeddedMountGeneration;
  host.dataset['state'] = 'mounting';
  setExampleStatus(view, '正在挂载', 'ready');

  const task = embeddedMountTail.then(() =>
    mountEmbeddedEditorNow(requestId, exampleId, host, view, suppliedInput),
  );
  embeddedMountTail = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

async function mountEmbeddedEditorNow(
  requestId: number,
  exampleId: string,
  host: HTMLDivElement,
  view: HTMLElement,
  suppliedInput: unknown | undefined,
): Promise<BomEditorComponent | null> {
  if (requestId !== embeddedMountGeneration) return null;

  destroyActiveEmbeddedEditors();
  for (const candidate of embeddedEditorHosts) {
    candidate.replaceChildren();
    candidate.removeAttribute('data-state');
    candidate.style.removeProperty('zoom');
  }
  host.dataset['state'] = 'mounting';

  if (exampleId === 'lifecycle') {
    return mountMultiInstanceExampleNow(requestId, exampleId, host, view, suppliedInput);
  }
  if (exampleId === 'frameworks') {
    return mountFrameworkIntegrationExampleNow(requestId, exampleId, host, view, suppliedInput);
  }

  let component: BomEditorComponent | null = null;
  try {
    const input = suppliedInput === undefined
      ? readExampleInput(exampleId)
      : suppliedInput;
    const props = createEmbeddedComponentProps(exampleId, input);
    component = createBomEditorComponent(props);
    if (requestId !== embeddedMountGeneration) {
      component.destroy();
      return null;
    }

    activeEmbeddedEditor = component;
    const mounted = await component.mount(host);
    if (requestId !== embeddedMountGeneration) {
      component.destroy();
      if (activeEmbeddedEditor === component) activeEmbeddedEditor = null;
      return null;
    }
    if (!mounted.ok) throw new Error(mounted.error.code);

    const ready = await component.ready;
    if (requestId !== embeddedMountGeneration) {
      component.destroy();
      if (activeEmbeddedEditor === component) activeEmbeddedEditor = null;
      return null;
    }
    if (!ready.ok) throw new Error(ready.error.code);

    host.dataset['state'] = 'ready';
    recordEmbeddedLifecycle(exampleId, 'ready', {
      instanceId: component.instanceId,
    });
    setExampleStatus(view, '已挂载', 'ready');
    return component;
  } catch (error) {
    component?.destroy();
    if (activeEmbeddedEditor === component) activeEmbeddedEditor = null;
    if (requestId === embeddedMountGeneration) {
      renderEmbeddedEditorError(host, error);
      recordEmbeddedLifecycle(exampleId, 'failed', {
        error: error instanceof Error ? error.message : '组件无法挂载',
      });
      setExampleStatus(view, '挂载失败', 'error');
    }
    return null;
  }
}

function destroyActiveEmbeddedEditors(): void {
  const editors = new Set<BomEditorComponent>();
  const frameworkRuntime = activeFrameworkRuntime;
  if (activeEmbeddedEditor !== null) editors.add(activeEmbeddedEditor);
  for (const editor of activeEmbeddedAuxiliaryEditors) editors.add(editor);
  activeEmbeddedEditor = null;
  activeEmbeddedAuxiliaryEditors = [];
  activeFrameworkRuntime = null;
  for (const editor of editors) {
    if (frameworkRuntime?.component === editor) frameworkRuntime.destroy();
    else editor.destroy();
  }
}

async function mountMultiInstanceExampleNow(
  requestId: number,
  exampleId: string,
  host: HTMLDivElement,
  view: HTMLElement,
  suppliedInput: unknown | undefined,
): Promise<BomEditorComponent | null> {
  let primary: BomEditorComponent | null = null;
  let secondary: BomEditorComponent | null = null;
  try {
    const input = suppliedInput === undefined
      ? readExampleInput(exampleId)
      : suppliedInput;
    const record = asRecord(input);
    if (record === null) throw new Error('多实例示例的输入必须是 JSON 对象');
    const primaryHost = createMultiInstanceHostSlot('primary', '主实例');
    const secondaryHost = createMultiInstanceHostSlot('secondary', '从实例');
    const layout = document.createElement('div');
    layout.className = 'example-multi-instance-layout';
    layout.append(primaryHost, secondaryHost);
    host.replaceChildren(layout);

    primary = createBomEditorComponent(
      createLifecycleComponentProps(
        record,
        nonEmptyString(record['primaryInstanceId']) ?? 'demo-primary',
      ),
    );
    secondary = createBomEditorComponent(
      createLifecycleComponentProps(
        record,
        nonEmptyString(record['secondaryInstanceId']) ?? 'demo-secondary',
      ),
    );
    if (requestId !== embeddedMountGeneration) {
      primary.destroy();
      secondary.destroy();
      return null;
    }

    activeEmbeddedEditor = primary;
    activeEmbeddedAuxiliaryEditors = [secondary];
    const mounted = await Promise.all([primary.mount(primaryHost), secondary.mount(secondaryHost)]);
    if (!mounted.every((result) => result.ok)) {
      throw new Error(mounted.find((result) => !result.ok)?.error.code ?? '实例无法挂载');
    }
    const ready = await Promise.all([primary.ready, secondary.ready]);
    if (!ready.every((result) => result.ok)) {
      throw new Error(ready.find((result) => !result.ok)?.error.code ?? '实例未就绪');
    }
    if (requestId !== embeddedMountGeneration) {
      destroyActiveEmbeddedEditors();
      return null;
    }
    host.dataset['state'] = 'ready';
    recordEmbeddedLifecycle(exampleId, 'ready', {
      instanceIds: [primary.instanceId, secondary.instanceId],
      mountedInstances: 2,
    });
    setExampleStatus(view, '已挂载两个实例', 'ready');
    return primary;
  } catch (error) {
    primary?.destroy();
    secondary?.destroy();
    if (activeEmbeddedEditor === primary) activeEmbeddedEditor = null;
    activeEmbeddedAuxiliaryEditors = [];
    if (requestId === embeddedMountGeneration) {
      renderEmbeddedEditorError(host, error);
      recordEmbeddedLifecycle(exampleId, 'failed', {
        error: error instanceof Error ? error.message : '组件无法挂载',
      });
      setExampleStatus(view, '挂载失败', 'error');
    }
    return null;
  }
}

async function mountFrameworkIntegrationExampleNow(
  requestId: number,
  exampleId: string,
  host: HTMLDivElement,
  view: HTMLElement,
  suppliedInput: unknown | undefined,
): Promise<BomEditorComponent | null> {
  let runtime: FrameworkRuntime | null = null;
  try {
    const input = suppliedInput === undefined
      ? readExampleInput(exampleId)
      : suppliedInput;
    const record = asRecord(input);
    if (record === null) throw new Error('接入示例的输入必须是 JSON 对象');
    const kind = frameworkAdapterKind(record['adapter']) ?? 'native';
    const instanceId = nonEmptyString(record['instanceId']) ?? `demo-framework-${kind}`;
    const props = createFrameworkComponentProps(record, kind, instanceId);
    runtime = createFrameworkRuntime(kind, props);
    if (requestId !== embeddedMountGeneration) {
      runtime.destroy();
      return null;
    }

    activeFrameworkRuntime = runtime;
    activeEmbeddedEditor = runtime.component;
    const mounted = await runtime.mount(host);
    if (requestId !== embeddedMountGeneration) {
      runtime.destroy();
      if (activeFrameworkRuntime === runtime) activeFrameworkRuntime = null;
      if (activeEmbeddedEditor === runtime.component) activeEmbeddedEditor = null;
      return null;
    }
    if (!mounted.ok) throw new Error(mounted.error.code);
    const ready = await runtime.component.ready;
    if (requestId !== embeddedMountGeneration) {
      runtime.destroy();
      if (activeFrameworkRuntime === runtime) activeFrameworkRuntime = null;
      if (activeEmbeddedEditor === runtime.component) activeEmbeddedEditor = null;
      return null;
    }
    if (!ready.ok) throw new Error(ready.error.code);

    host.dataset['state'] = 'ready';
    recordEmbeddedLifecycle(exampleId, 'ready', {
      adapter: kind,
      instanceId: runtime.component.instanceId,
      publicSurface: kind === 'react'
        ? 'createBomEditorReactAdapter'
        : kind === 'vue'
          ? 'createBomEditorVueAdapter'
          : kind === 'umd'
            ? 'installBomEditorUmd → createBomEditorComponent'
            : 'createBomEditorComponent',
    });
    setExampleStatus(view, '已挂载公开 SDK', 'ready');
    return runtime.component;
  } catch (error) {
    runtime?.destroy();
    if (activeFrameworkRuntime === runtime) activeFrameworkRuntime = null;
    if (activeEmbeddedEditor === runtime?.component) activeEmbeddedEditor = null;
    if (requestId === embeddedMountGeneration) {
      renderEmbeddedEditorError(host, error);
      recordEmbeddedLifecycle(exampleId, 'failed', {
        error: error instanceof Error ? error.message : '公开 SDK 无法挂载',
      });
      setExampleStatus(view, '挂载失败', 'error');
    }
    return null;
  }
}

function createFrameworkComponentProps(
  input: JsonRecord,
  kind: FrameworkAdapterKind,
  instanceId: string,
): BomEditorComponentProps {
  const props = createEmbeddedComponentProps('frameworks', input) as unknown as JsonRecord;
  const document = asRecord(props['document']);
  if (document === null) throw new Error('接入示例无法创建文档');
  return {
    ...props,
    instanceId,
    document: {
      ...document,
      documentId: `demo-framework-${kind}-${instanceId}`,
    },
    outputs: createFrameworkOutputs(),
  } as unknown as BomEditorComponentProps;
}

function createFrameworkOutputs(): NonNullable<BomEditorComponentProps['outputs']> {
  return {
    onDocumentChange: ({ snapshot, commit, origin }) => {
      recordEmbeddedEvent('frameworks', 'documentChange', {
        documentId: snapshot.documentId,
        revision: commit.revision,
        transactionId: commit.transactionId,
        origin,
      });
    },
    onDocumentReplaced: ({ reason, previous, next }) => {
      recordEmbeddedEvent('frameworks', 'documentReplaced', {
        reason,
        previous: previous === undefined ? null : {
          documentId: previous.documentId,
          revision: previous.revision,
        },
        next: {
          documentId: next.documentId,
          revision: next.revision,
          sourceType: next.sourceType,
        },
      });
    },
    onError: (event) => {
      recordEmbeddedEvent('frameworks', 'error', {
        type: event.type,
        sequence: event.sequence,
      });
    },
  };
}

function createFrameworkRuntime(
  kind: FrameworkAdapterKind,
  props: BomEditorComponentProps,
): FrameworkRuntime {
  if (kind === 'react') {
    const adapter = createBomEditorReactAdapter(props);
    return {
      kind,
      component: adapter.component,
      mount: (container) => adapter.mount(container),
      unmount: () => adapter.unmount(),
      destroy: () => adapter.destroy(),
    };
  }
  if (kind === 'vue') {
    const adapter = createBomEditorVueAdapter(props);
    return {
      kind,
      component: adapter.component,
      mount: (container) => adapter.mount(container),
      unmount: () => adapter.unmount(),
      destroy: () => adapter.destroy(),
    };
  }
  if (kind === 'umd') {
    const target = Object.create(null) as Record<string, unknown>;
    const namespace = installBomEditorUmd(target, {
      globalName: 'BomEditorDemo',
      version: '1.0.0-demo',
    });
    const component = namespace.createBomEditorComponent(props);
    return {
      kind,
      component,
      mount: (container) => component.mount(container),
      unmount: () => component.unmount(),
      destroy: () => component.destroy(),
    };
  }
  const component = createBomEditorComponent(props);
  return {
    kind,
    component,
    mount: (container) => component.mount(container),
    unmount: () => component.unmount(),
    destroy: () => component.destroy(),
  };
}

function frameworkAdapterKind(value: unknown): FrameworkAdapterKind | null {
  return value === 'native' || value === 'react' || value === 'vue' || value === 'umd'
    ? value
    : null;
}

function createMultiInstanceHostSlot(
  slot: 'primary' | 'secondary',
  label: string,
): HTMLDivElement {
  const host = document.createElement('div');
  host.className = 'example-multi-instance-slot';
  host.dataset['exampleInstance'] = slot;
  host.setAttribute('aria-label', label);
  return host;
}

function createLifecycleComponentProps(
  input: JsonRecord,
  instanceId: string,
): BomEditorComponentProps {
  const props = createEmbeddedComponentProps('lifecycle', input) as unknown as JsonRecord;
  const document = asRecord(props['document']);
  if (document === null) throw new Error('多实例示例无法创建文档');
  return {
    ...props,
    instanceId,
    document: {
      ...document,
      documentId: `demo-example-lifecycle-${instanceId}`,
    },
    outputs: createEmbeddedOutputs('lifecycle'),
  } as unknown as BomEditorComponentProps;
}

function readExampleInput(exampleId: string): unknown {
  const input = document.querySelector<HTMLTextAreaElement>(
    `[data-example-input="${exampleId}"]`,
  );
  if (input === null) return {};
  return JSON.parse(input.value) as unknown;
}

function renderEmbeddedEditorError(host: HTMLDivElement, error: unknown): void {
  host.dataset['state'] = 'error';
  const message = document.createElement('p');
  message.className = 'example-editor-error';
  message.textContent = error instanceof Error ? error.message : '组件无法挂载';
  host.replaceChildren(message);
}

function createEmbeddedComponentProps(
  exampleId: string,
  input: unknown,
): BomEditorComponentProps {
  if (exampleId === 'mount') {
    const record = asRecord(input);
    if (record === null) throw new Error('挂载示例的输入必须是 JSON 对象');
    const props: JsonRecord = {
      ...record,
      outputs: createEmbeddedOutputs(exampleId),
    };
    if (props['instanceId'] === undefined) {
      props['instanceId'] = 'bom-editor-example-mount';
    }
    return props as unknown as BomEditorComponentProps;
  }

  const scenarioInput = asRecord(input) ?? {};
  const rows = createEmbeddedRows(exampleId, scenarioInput);
  const columns = createEmbeddedColumns(exampleId, scenarioInput);
  const selection = createEmbeddedSelection(exampleId, scenarioInput, rows);
  const roots = rows
    .filter((row) => row.parentId === null)
    .map((row) => row.occurrenceId);
  const initialColumns = columns.map((column) => ({
    columnId: column['columnId'],
    width: column['width'],
    frozen: column['frozen'],
    visible: column['visible'],
  }));

  const props = {
    schema: {
      schemaVersion: 'demo-example-schema-v1',
      fields: [
        {
          fieldId: 'materialCode',
          path: ['materialCode'],
          type: { kind: 'string', maxLength: 64 },
          required: true,
          nullable: false,
        },
        {
          fieldId: 'name',
          path: ['name'],
          type: { kind: 'string', maxLength: 128 },
          required: false,
          nullable: false,
        },
        {
          fieldId: 'quantity',
          path: ['specification', 'quantity'],
          type: { kind: 'integer', min: '0', max: '100000' },
          required: false,
          nullable: false,
        },
      ],
      allowAdditionalFields: false,
      recommendedDepth: 3,
      maximumDepth: 6,
      canonicalizationVersion: 'bom-canonical-v1',
      contentHashAlgorithm: 'SHA-256',
    },
    document: {
      schemaVersion: 'demo-example-schema-v1',
      documentId: `demo-example-${exampleId}`,
      revision: '1',
      positionKeyCodecVersion: 'lexicographic-ascii-v1',
      completeness: 'complete',
      knownRootCount: roots.length,
      roots,
      nodes: rows.map((row, index) => ({
        occurrenceId: row.occurrenceId,
        kind: 'material',
        materialId: `demo-material-${String(index + 1)}`,
        materialCode: row.materialCode,
        parentId: row.parentId,
        positionKey: `A${String(index).padStart(4, '0')}`,
        fields: {
          materialCode: row.materialCode,
          name: row.name,
          specification: { quantity: row.quantity },
        },
      })),
    },
    columns,
    instanceId: `bom-editor-example-${exampleId}`,
    protocolVersion: 'bom-editor-component/v1',
    initialView: {
      rowHeight: 30,
      columns: initialColumns,
      expandedIds: [],
      expandAll: exampleId === 'structure',
      selection,
      scrollLeft: 0,
      scrollTop: 0,
    },
    history: { maxEntries: 100, maxBytes: 1_048_576 },
    pasteLimits: { maxRows: 1000, maxColumns: 32, maxCells: 10_000 },
    editNavigation: { enter: 'down', tab: 'next-editable' },
    renderer: {
      labels: {
        treegridLabel: 'BOM 编辑器示例',
        treegridDescription: '可直接操作的 BOM 编辑器实例。',
        editorLabel: 'BOM 单元格编辑器',
        rowNumberHeader: '行号',
      },
    },
    ...(exampleId === 'exchange'
      ? {
        exportPolicy: {
          authorize: async (request: Readonly<{ readonly fieldIds: readonly string[] }>) =>
            Object.freeze({
              decisionId: 'demo-export-allowed',
              allowed: true,
              fieldIds: Object.freeze([...request.fieldIds]),
            }),
        },
      }
      : {}),
    ...(exampleId === 'plugins'
      ? {
        pluginGrantPolicy: {
          grant: async () => Object.freeze([]),
        },
      }
      : {}),
    ...(exampleId === 'matching'
      ? {
        matchApprovalPolicy: {
          authorize: async () => Object.freeze({
            decisionId: 'demo-match-allowed',
            allowed: true,
          }),
        },
      }
      : {}),
    outputs: createEmbeddedOutputs(exampleId),
  };
  return props as unknown as BomEditorComponentProps;
}

type EmbeddedRow = Readonly<{
  occurrenceId: string;
  materialCode: string;
  name: string;
  quantity: number;
  parentId: string | null;
}>;

function createEmbeddedRows(
  exampleId: string,
  input: JsonRecord,
): readonly EmbeddedRow[] {
  const defaults: EmbeddedRow[] = [
    { occurrenceId: 'occ-0001', materialCode: 'PUMP-001', name: '泵体总成', quantity: 12, parentId: null },
    { occurrenceId: 'occ-0007', materialCode: 'PUMP-002', name: '密封组件', quantity: 12, parentId: null },
    { occurrenceId: 'occ-0024', materialCode: 'VALVE-024', name: '阀体', quantity: 8, parentId: null },
    { occurrenceId: 'occ-0031', materialCode: 'MOTOR-031', name: '驱动电机', quantity: 4, parentId: null },
    { occurrenceId: 'occ-0042', materialCode: 'PIPE-042', name: '连接管路', quantity: 16, parentId: null },
  ];
  if (exampleId === 'search') {
    const searchRows = normalizeSearchRows(input['rows']);
    if (searchRows !== null && searchRows.length > 0) {
      return searchRows.map((row, index) => ({
        occurrenceId: row.occurrenceId,
        materialCode: row.materialCode ?? demoText(row.values['materialCode'], `ITEM-${String(index + 1).padStart(3, '0')}`),
        name: demoText(row.values['name'], `示例物料 ${String(index + 1)}`),
        quantity: demoQuantity(row.values['quantity'], index + 1),
        parentId: null,
      }));
    }
  }
  if (exampleId === 'selection') {
    return [
      { occurrenceId: 'occ-0001', materialCode: 'PUMP-001', name: '泵体总成', quantity: 2, parentId: null },
      { occurrenceId: 'occ-0007', materialCode: 'PUMP-002', name: '密封组件', quantity: 4, parentId: null },
      { occurrenceId: 'occ-0024', materialCode: 'VALVE-024', name: '阀体', quantity: 0, parentId: null },
      { occurrenceId: 'occ-0031', materialCode: 'MOTOR-031', name: '驱动电机', quantity: 0, parentId: null },
      { occurrenceId: 'occ-0042', materialCode: 'PIPE-042', name: '连接管路', quantity: 0, parentId: null },
    ];
  }
  if (exampleId === 'clipboard') {
    return [
      ...defaults,
      { occurrenceId: 'occ-0056', materialCode: 'GASKET-056', name: '密封垫片', quantity: 6, parentId: null },
      { occurrenceId: 'occ-0063', materialCode: 'BOLT-063', name: '连接螺栓', quantity: 24, parentId: null },
    ];
  }
  if (exampleId === 'structure') {
    // The source follows the target so Alt+Right reproduces an "inside" drop.
    return [
      { occurrenceId: 'occ-0001', materialCode: 'PUMP-001', name: '泵体总成', quantity: 12, parentId: null },
      { occurrenceId: 'occ-0024', materialCode: 'VALVE-024', name: '阀体', quantity: 8, parentId: null },
      { occurrenceId: 'occ-0007', materialCode: 'PUMP-002', name: '密封组件', quantity: 12, parentId: null },
      { occurrenceId: 'occ-0031', materialCode: 'MOTOR-031', name: '驱动电机', quantity: 4, parentId: 'occ-0001' },
      { occurrenceId: 'occ-0042', materialCode: 'PIPE-042', name: '连接管路', quantity: 16, parentId: 'occ-0001' },
    ];
  }
  if (exampleId === 'edit') {
    const requestedId = nonEmptyString(input['occurrenceId']);
    const beforeValue = input['beforeValue'];
    if (requestedId !== null) {
      const index = defaults.findIndex((row) => row.occurrenceId === requestedId);
      const replacement = {
        occurrenceId: requestedId,
        materialCode: 'PUMP-002',
        name: '密封组件',
        quantity: demoQuantity(beforeValue, 12),
        parentId: null,
      };
      if (index >= 0) defaults[index] = replacement;
      else defaults[1] = replacement;
    }
  }
  return defaults;
}

function demoText(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function demoQuantity(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : fallback;
}

function createEmbeddedColumns(
  exampleId: string,
  input: JsonRecord,
): JsonRecord[] {
  let columns: JsonRecord[] = [
    {
      columnId: 'materialCode',
      fieldName: 'materialCode',
      fieldPath: ['materialCode'],
      label: '物料编码',
      width: 156,
      minWidth: 110,
      maxWidth: 300,
      editable: true,
      frozen: 'start',
      visible: true,
      format: { kind: 'text' },
    },
    {
      columnId: 'quantity',
      fieldName: 'quantity',
      fieldPath: ['specification', 'quantity'],
      label: '数量',
      width: 108,
      minWidth: 80,
      maxWidth: 240,
      editable: true,
      frozen: false,
      visible: true,
      alignment: 'end',
      format: { kind: 'integer', useGrouping: true },
    },
    {
      columnId: 'name',
      fieldName: 'name',
      fieldPath: ['name'],
      label: '名称',
      width: 230,
      minWidth: 140,
      maxWidth: 480,
      editable: true,
      frozen: false,
      visible: true,
      format: { kind: 'text' },
    },
  ];

  if (exampleId === 'view') {
    const columnId = nonEmptyString(input['columnId']);
    const columnIndex = columnId === null
      ? -1
      : columns.findIndex((column) => column['columnId'] === columnId);
    if (columnIndex >= 0) {
      const current = columns[columnIndex]!;
      const width = finiteNumber(input['width']);
      const visible = booleanValue(input['visible']);
      const frozen = frozenValue(input['frozen']);
      columns[columnIndex] = {
        ...current,
        ...(width !== null && width >= 40 && width <= 2_000 ? { width } : {}),
        ...(columnIndex > 0 && visible !== null ? { visible } : {}),
        ...(frozen !== null ? { frozen } : {}),
      };
      const order = nonNegativeInteger(input['order']);
      if (columnIndex > 0 && order !== null) {
        const [moved] = columns.splice(columnIndex, 1);
        if (moved !== undefined) {
          columns.splice(Math.min(Math.max(order, 1), columns.length), 0, moved);
        }
      }
    }
  }

  if (exampleId === 'search' && isMountColumnFormat(input['format'])) {
    columns = columns.map((column) =>
      column['columnId'] === 'quantity'
        ? { ...column, format: input['format'] }
        : column,
    );
  }
  return columns;
}

function createEmbeddedSelection(
  exampleId: string,
  input: JsonRecord,
  rows: readonly EmbeddedRow[],
): Readonly<Record<string, unknown>> {
  let occurrenceId = rows[0]?.occurrenceId ?? 'occ-0001';
  let columnId = 'materialCode';
  if (exampleId === 'edit') {
    const requestedId = nonEmptyString(input['occurrenceId']);
    if (requestedId !== null && rows.some((row) => row.occurrenceId === requestedId)) {
      occurrenceId = requestedId;
    }
    const path = parseFieldPath(input['fieldPath']);
    columnId = path !== null && JSON.stringify(path) === JSON.stringify(['name'])
      ? 'name'
      : 'quantity';
  } else if (exampleId === 'selection') {
    const range = asRecord(input['selection']);
    const anchor = range === null ? null : asRecord(range['anchor']);
    const focus = range === null ? null : asRecord(range['focus']);
    const anchorOccurrenceId = anchor === null ? null : nonEmptyString(anchor['occurrenceId']);
    const anchorColumnId = anchor === null ? null : nonEmptyString(anchor['columnId']);
    const focusOccurrenceId = focus === null ? null : nonEmptyString(focus['occurrenceId']);
    const focusColumnId = focus === null ? null : nonEmptyString(focus['columnId']);
    if (
      anchorOccurrenceId !== null && anchorColumnId !== null &&
      focusOccurrenceId !== null && focusColumnId !== null &&
      rows.some((row) => row.occurrenceId === anchorOccurrenceId) &&
      rows.some((row) => row.occurrenceId === focusOccurrenceId) &&
      ['materialCode', 'quantity', 'name'].includes(anchorColumnId) &&
      ['materialCode', 'quantity', 'name'].includes(focusColumnId)
    ) {
      return {
        activeCell: { occurrenceId: focusOccurrenceId, columnId: focusColumnId },
        range: {
          anchor: { occurrenceId: anchorOccurrenceId, columnId: anchorColumnId },
          focus: { occurrenceId: focusOccurrenceId, columnId: focusColumnId },
        },
      };
    }
  } else if (exampleId === 'structure') {
    const sourceOccurrenceId = nonEmptyString(input['sourceOccurrenceId']);
    if (sourceOccurrenceId !== null && rows.some((row) => row.occurrenceId === sourceOccurrenceId)) {
      occurrenceId = sourceOccurrenceId;
    }
    columnId = 'materialCode';
  } else if (exampleId === 'clipboard') {
    const target = asRecord(input['target']);
    const rowIndex = target === null ? null : nonNegativeInteger(target['rowIndex']);
    const columnIndex = target === null ? null : nonNegativeInteger(target['columnIndex']);
    occurrenceId = rows[Math.min(rowIndex ?? 0, rows.length - 1)]?.occurrenceId ?? occurrenceId;
    columnId = columnIndex === 0 ? 'materialCode' : columnIndex === 2 ? 'name' : 'quantity';
  }
  return {
    activeCell: { occurrenceId, columnId },
    range: null,
  };
}

function createEmbeddedOutputs(
  exampleId: string,
): NonNullable<BomEditorComponentProps['outputs']> {
  return {
    onDocumentChange: (event) => {
      recordEmbeddedEvent(exampleId, 'documentChange', {
        documentId: event.snapshot.documentId,
        revision: event.commit.revision,
        transactionId: event.commit.transactionId,
        origin: event.origin,
      });
    },
    onSelectionChange: (event) => recordEmbeddedEvent(exampleId, 'selectionChanged', event),
    onViewChange: (event) => recordEmbeddedEvent(exampleId, 'viewChanged', event),
    onDocumentReplaced: (event) => recordEmbeddedEvent(exampleId, 'documentReplaced', event),
    onStructureMoveRequest: (event) => recordEmbeddedEvent(exampleId, 'structureMoveRequested', event),
    onEditRejected: (event) => recordEmbeddedEvent(exampleId, 'editRejected', event),
    onPaste: (event) => recordEmbeddedEvent(exampleId, 'paste', event),
    onValidationChange: (event) => recordEmbeddedEvent(exampleId, 'validationChanged', event),
    onMaterialMatchAudit: (event) => recordEmbeddedEvent(exampleId, 'materialMatchAudit', event),
    onClipboardCompleted: (event) => recordEmbeddedEvent(exampleId, 'clipboardCompleted', event),
    onClipboardRejected: (event) => recordEmbeddedEvent(exampleId, 'clipboardRejected', event),
    onTaskProgress: (event) => recordEmbeddedEvent(exampleId, 'taskProgress', event),
    onError: (event) => recordEmbeddedEvent(exampleId, 'error', event),
  };
}

function recordEmbeddedLifecycle(
  exampleId: string,
  lifecycle: string,
  details: Readonly<Record<string, unknown>> = {},
): void {
  embeddedRuntimeOutputs.set(exampleId, {
    ...(embeddedRuntimeOutputs.get(exampleId) ?? {}),
    lifecycle,
    ...details,
  });
  renderExampleOutput(exampleId);
}

function recordEmbeddedEvent(
  exampleId: string,
  name: string,
  event: unknown,
): void {
  const previous = embeddedRuntimeOutputs.get(exampleId) ?? {};
  const output = {
    name,
    payload: toDemoJson(event),
  };
  const priorHistory = Array.isArray(previous['outputHistory'])
    ? previous['outputHistory']
    : [];
  embeddedRuntimeOutputs.set(exampleId, {
    ...previous,
    lifecycle: 'ready',
    lastOutput: output,
    outputHistory: [...priorHistory, output].slice(-8),
  });
  renderExampleOutput(exampleId);
}

function recordEmbeddedAction(
  exampleId: string,
  name: string,
  result: unknown,
): void {
  embeddedRuntimeOutputs.set(exampleId, {
    ...(embeddedRuntimeOutputs.get(exampleId) ?? {}),
    lifecycle: 'ready',
    action: {
      name,
      result: toDemoJson(result),
    },
  });
  renderExampleOutput(exampleId);
}

function renderExampleOutput(exampleId: string): void {
  const output = document.querySelector<HTMLElement>(
    `[data-example-output="${exampleId}"]`,
  );
  if (output === null) return;
  output.textContent = JSON.stringify({
    scenario: scenarioOutputs.get(exampleId) ?? null,
    component: embeddedRuntimeOutputs.get(exampleId) ?? null,
  }, null, 2);
}

function toDemoJson(value: unknown): unknown {
  try {
    const serialized = JSON.stringify(value, (_key, candidate: unknown) =>
      typeof candidate === 'bigint'
        ? candidate.toString()
        : candidate instanceof Blob
          ? { type: 'Blob', mimeType: candidate.type, size: candidate.size }
          : candidate,
    );
    return serialized === undefined ? null : JSON.parse(serialized) as unknown;
  } catch {
    return { unavailable: true };
  }
}

async function runLiveScenarioAction(
  exampleId: string,
  component: BomEditorComponent,
  input: unknown,
): Promise<void> {
  const record = asRecord(input);
  if (record === null) return;

  switch (exampleId) {
    case 'mount':
      recordEmbeddedAction(exampleId, 'mount', {
        instanceId: component.instanceId,
        presentation: component.getPresentation(),
      });
      return;
    case 'edit': {
      const occurrenceId = nonEmptyString(record['occurrenceId']) ?? 'occ-0007';
      const fieldPath = parseFieldPath(record['fieldPath']);
      const columnId = fieldPath !== null && JSON.stringify(fieldPath) === JSON.stringify(['name'])
        ? 'name'
        : 'quantity';
      const value = record['value'];
      const text = typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : columnId === 'quantity' ? '13' : '已更新的名称';
      recordEmbeddedAction(
        exampleId,
        'keyboardEdit',
        await runDemoCellEdit(exampleId, component, { occurrenceId, columnId }, text),
      );
      return;
    }
    case 'view':
      recordEmbeddedAction(exampleId, 'viewTemplate', {
        template: component.getViewTemplate(),
        applied: component.setColumns(component.getViewTemplate().columns),
      });
      return;
    case 'search': {
      const query = typeof record['query'] === 'string' ? record['query'] : '';
      const mode = searchMode(record['mode']);
      const caseSensitive = booleanValue(record['caseSensitive']);
      const matchWholeCell = booleanValue(record['matchWholeCell']);
      const limit = positiveInteger(record['limit']);
      const result = await component.search({
        query,
        ...(mode === null ? {} : { mode }),
        ...(caseSensitive === null ? {} : { caseSensitive }),
        ...(matchWholeCell === null ? {} : { matchWholeCell }),
        ...(limit === null ? {} : { limit }),
      });
      recordEmbeddedAction(exampleId, 'search', result.ok ? result.value : result.error);
      return;
    }
    case 'clipboard': {
      const representations = resolveDemoClipboardRepresentations(record);
      if (!representations.ok) {
        recordEmbeddedAction(exampleId, 'previewAndPaste', {
          status: 'rejected',
          errors: representations.errors,
        });
        return;
      }
      const target = asRecord(record['target']);
      const rowIndex = target === null ? 0 : nonNegativeInteger(target['rowIndex']) ?? 0;
      const columnIndex = target === null ? 0 : nonNegativeInteger(target['columnIndex']) ?? 0;
      const columns = ['materialCode', 'quantity', 'name'];
      const occurrenceIds = createEmbeddedRows(exampleId, record).map((row) => row.occurrenceId);
      const address = {
        occurrenceId: occurrenceIds[Math.min(rowIndex, occurrenceIds.length - 1)]!,
        columnId: columns[Math.min(columnIndex, columns.length - 1)]!,
      };
      const focused = component.focus();
      const selected = component.focusCell(address);
      const preview = await component.previewPaste(representations.value);
      const treegrid = getExampleTreegrid(exampleId);
      const pasted = treegrid === null
        ? { dispatched: false, reason: 'TREEGRID_NOT_MOUNTED' }
        : await dispatchDemoPaste(treegrid, representations.value);
      recordEmbeddedAction(exampleId, 'previewAndPaste', {
        focused,
        selected,
        candidateFormats: representations.formats,
        preview: preview.ok ? preview.value : { error: preview.error, diagnostics: preview.diagnostics },
        pasted,
      });
      return;
    }
    case 'selection': {
      const focused = component.focus();
      component.fillSeries();
      await waitForDemoFrames(2);
      recordEmbeddedAction(exampleId, 'fillSeries', {
        focused,
        requested: true,
        completion: '通过 onDocumentChange 输出实际 Commit',
      });
      return;
    }
    case 'structure': {
      const occurrenceId = nonEmptyString(record['sourceOccurrenceId']) ?? 'occ-0007';
      const focused = component.focus();
      const selected = component.focusCell({ occurrenceId, columnId: 'materialCode' });
      const treegrid = getExampleTreegrid(exampleId);
      const keyboard = treegrid === null
        ? { dispatched: false, reason: 'TREEGRID_NOT_MOUNTED' }
        : await dispatchDemoKey(treegrid, { key: 'ArrowRight', altKey: true });
      recordEmbeddedAction(exampleId, 'keyboardStructureMove', {
        focused,
        selected,
        keyboard,
        intent: {
          sourceOccurrenceId: occurrenceId,
          targetOccurrenceId: nonEmptyString(record['targetOccurrenceId']) ?? 'occ-0024',
          position: record['position'] ?? 'inside',
        },
      });
      return;
    }
    case 'history': {
      const edited = await runDemoCellEdit(
        exampleId,
        component,
        { occurrenceId: 'occ-0001', columnId: 'quantity' },
        typeof record['value'] === 'number' || typeof record['value'] === 'string'
          ? String(record['value'])
          : '13',
      );
      const treegrid = getExampleTreegrid(exampleId);
      const undo = treegrid === null
        ? { dispatched: false, reason: 'TREEGRID_NOT_MOUNTED' }
        : await dispatchDemoKey(treegrid, { key: 'z', ctrlKey: true });
      const redo = treegrid === null
        ? { dispatched: false, reason: 'TREEGRID_NOT_MOUNTED' }
        : await dispatchDemoKey(treegrid, { key: 'y', ctrlKey: true });
      recordEmbeddedAction(exampleId, 'editUndoRedo', { edited, undo, redo });
      return;
    }
    case 'query': {
      const query = asRecord(record['query']) ?? {};
      const result = component.setViewQuery(
        query as Parameters<BomEditorComponent['setViewQuery']>[0],
      );
      recordEmbeddedAction(exampleId, 'setViewQuery', result);
      return;
    }
    case 'columns': {
      const freeze = asRecord(record['freeze']);
      const insert = asRecord(record['insert']);
      const freezeColumnId = freeze === null ? null : nonEmptyString(freeze['columnId']);
      const frozen = freeze === null ? null : frozenValue(freeze['frozen']);
      const insertColumnId = insert === null ? null : nonEmptyString(insert['referenceColumnId']);
      const position = insert?.['position'] === 'before' || insert?.['position'] === 'after'
        ? insert['position']
        : null;
      const count = insert === null ? null : positiveInteger(insert['count']);
      const requestedDeleteColumnIds = normalizeStringList(record['deleteColumnIds']) ?? [];
      const beforeInsert = component.getViewTemplate();
      const inserted = insertColumnId === null || position === null || count === null
        ? null
        : component.insertColumn(insertColumnId, position, count);
      const afterInsert = component.getViewTemplate();
      const knownColumnIds = new Set(beforeInsert.columns.map((column) => column.columnId));
      const insertedColumnIds = afterInsert.columns
        .map((column) => column.columnId)
        .filter((columnId) => !knownColumnIds.has(columnId));
      const deleteColumnIds = requestedDeleteColumnIds.length > 0
        ? requestedDeleteColumnIds
        : insertedColumnIds;
      recordEmbeddedAction(exampleId, 'columnCommands', {
        freeze: freezeColumnId === null || frozen === null
          ? null
          : component.setColumnFrozen(freezeColumnId, frozen),
        insert: inserted,
        insertedColumnIds,
        delete: deleteColumnIds.length === 0
          ? null
          : component.deleteColumns(deleteColumnIds),
        template: component.getViewTemplate(),
      });
      return;
    }
    case 'templates': {
      const template = component.getViewTemplate();
      recordEmbeddedAction(exampleId, 'captureAndApplyViewTemplate', {
        template,
        applied: component.applyViewTemplate(template),
      });
      return;
    }
    case 'validation': {
      const scope = record['scope'] === 'visible' || record['scope'] === 'selection'
        ? record['scope']
        : 'document';
      const result = await component.validate({ scope });
      recordEmbeddedAction(exampleId, 'validate', result.ok ? result.value : result.error);
      return;
    }
    case 'matching': {
      const selection = asRecord(record['selection']);
      const minConfidence = selection === null ? null : finiteNumber(selection['minConfidence']);
      const minScoreDelta = selection === null ? null : finiteNumber(selection['minScoreDelta']);
      const request = {
        query: typeof record['query'] === 'string' ? record['query'] : '',
        ...(positiveInteger(record['limit']) === null ? {} : { limit: positiveInteger(record['limit'])! }),
        ...(minConfidence === null || minScoreDelta === null
          ? {}
          : { selection: { minConfidence, minScoreDelta } }),
      };
      const result = await component.matchMaterials(
        request as Parameters<BomEditorComponent['matchMaterials']>[0],
      );
      if (!result.ok) {
        recordEmbeddedAction(exampleId, 'matchMaterials', result.error);
        return;
      }
      const targetOccurrenceId = nonEmptyString(record['targetOccurrenceId']) ?? 'occ-0024';
      const candidate = result.value.matches.find(
        (entry) => entry.occurrenceId !== targetOccurrenceId,
      ) ?? result.value.matches[0];
      const proposal = candidate === undefined
        ? null
        : component.proposeMaterialMatch(targetOccurrenceId, candidate);
      const applied = proposal !== null && proposal.ok
        ? await component.applyMaterialMatch(proposal.value)
        : null;
      recordEmbeddedAction(exampleId, 'matchAndAdoptMaterial', {
        matches: result.value,
        proposal,
        applied,
      });
      return;
    }
    case 'diff': {
      const props = createEmbeddedComponentProps(exampleId, input) as unknown as {
        readonly document: JsonRecord;
      };
      const documentId = nonEmptyString(props.document['documentId']) ?? `demo-example-${exampleId}`;
      const revision = revisionValue(record['nextRevision']);
      const nextRevision = String(revision === null ? 2 : revision);
      const nextDocument = { ...props.document, revision: nextRevision };
      const changedOccurrenceId = nonEmptyString(record['changedOccurrenceId']) ?? 'occ-0001';
      const changedColumnId = nonEmptyString(record['changedColumnId']) ?? 'name';
      const kind = isDemoDiffKind(record['kind']) ? record['kind'] : 'changed';
      const diffView = {
        protocol: 'bom-canvas-diff-view/v1',
        documentId,
        documentGeneration: 1,
        viewRevision: nextRevision,
        rows: [{ occurrenceId: changedOccurrenceId, kind }],
        cells: [{ occurrenceId: changedOccurrenceId, columnId: changedColumnId, kind }],
      };
      const result = await component.update({
        document: nextDocument as BomEditorComponentProps['document'],
        diffView: diffView as Parameters<BomEditorComponent['setDiffView']>[0],
      });
      recordEmbeddedAction(exampleId, 'controlledUpdateWithDiff', result.ok ? {
        accepted: true,
        diffView,
      } : result.error);
      return;
    }
    case 'exchange': {
      const importOptions = createDemoImportOptions(record);
      const exportOptions = createDemoExportOptionsList(record);
      const csv = typeof record['csv'] === 'string' ? record['csv'] : '';
      const imported = await component.importData(
        new Blob([csv], { type: 'text/csv;charset=utf-8' }),
        importOptions as Parameters<BomEditorComponent['importData']>[1],
      );
      const exported = await Promise.all(exportOptions.map(async (options) => {
        const result = await component.exportData(
          options as Parameters<BomEditorComponent['exportData']>[0],
        );
        return {
          request: options,
          result: result.ok ? result.value : result.error,
        };
      }));
      recordEmbeddedAction(exampleId, 'importPreviewAndAllExports', {
        imported: imported.ok ? imported.value : imported.error,
        exports: exported,
      });
      return;
    }
    case 'presentation': {
      const shortcuts = asRecord(record['shortcuts']) ?? {};
      const direction = record['direction'] === 'rtl' ? 'rtl' : 'ltr';
      const locale = record['locale'] === 'en-US' ? 'en-US' : 'zh-CN';
      const announcement = nonEmptyString(record['announcement']) ?? '示例编辑器已更新视图。';
      const theme = createDemoPresentationTheme(record['theme']);
      const zoom = demoPresentationZoom(record['zoom']);
      recordEmbeddedAction(exampleId, 'configurePresentation', {
        shortcuts: component.configureShortcuts(
          shortcuts as Parameters<BomEditorComponent['configureShortcuts']>[0],
        ),
        conflict: component.configureShortcuts({
          sequenceTimeoutMs: 1_000,
          bindings: [{
            id: 'demo-conflicting-undo',
            keys: 'Primary+Z',
            command: 'demo-conflicting-undo',
            scope: 'focused',
          }],
        }),
        reset: component.resetShortcuts(),
        presentation: component.configurePresentation({
          locale,
          direction,
          ...(theme === undefined ? {} : { theme }),
        }),
        effectivePresentation: component.getPresentation(),
        hostZoom: applyDemoPresentationZoom(exampleId, zoom),
        announcement: component.announce({ message: announcement, politeness: 'polite' }),
      });
      return;
    }
    case 'plugins': {
      const plugin = createDemoPlugin(record);
      if (plugin === null) {
        recordEmbeddedAction(exampleId, 'pluginLifecycle', {
          installed: false,
          reason: 'PLUGIN_MANIFEST_INVALID',
        });
        return;
      }
      const installed = await component.installPlugin(plugin);
      const installedState = component.getPlugins();
      const uninstalled = installed.ok
        ? await component.uninstallPlugin(plugin.manifest.id)
        : null;
      recordEmbeddedAction(exampleId, 'pluginLifecycle', {
        installed,
        installedState,
        uninstalled,
        finalState: component.getPlugins(),
      });
      return;
    }
    case 'lifecycle': {
      const secondary = activeEmbeddedAuxiliaryEditors[0] ?? null;
      const primaryHost = getExampleInstanceHost(exampleId, 'primary');
      const secondaryHost = getExampleInstanceHost(exampleId, 'secondary');
      if (secondary === null || primaryHost === null || secondaryHost === null) {
        recordEmbeddedAction(exampleId, 'multiInstanceLifecycle', {
          supported: false,
          reason: 'MULTI_INSTANCE_NOT_MOUNTED',
        });
        return;
      }
      const primaryFocus = await focusDemoInstance(component, primaryHost, 'occ-0001');
      const secondaryFocus = await focusDemoInstance(secondary, secondaryHost, 'occ-0007');
      const unmounted = component.unmount();
      const remounted = unmounted.ok
        ? await component.mount(primaryHost)
        : null;
      const remountedReady = remounted?.ok === true
          ? await component.ready
          : null;

      const destroyedInstanceId = secondary.instanceId;
      secondary.destroy();
      activeEmbeddedAuxiliaryEditors = [];
      const replacementId = nonEmptyString(record['replacementInstanceId']) ?? 'demo-secondary-replacement';
      const replacement = createBomEditorComponent(
        createLifecycleComponentProps(record, replacementId),
      );
      const replacementMount = await replacement.mount(secondaryHost);
      const replacementReady = replacementMount.ok ? await replacement.ready : null;
      if (replacementMount.ok && replacementReady?.ok === true) {
        activeEmbeddedAuxiliaryEditors = [replacement];
      } else {
        replacement.destroy();
      }
      recordEmbeddedAction(exampleId, 'multiInstanceLifecycle', {
        primary: {
          instanceId: component.instanceId,
          focus: primaryFocus,
          unmount: unmounted,
          remount: remounted,
          readyAfterRemount: remountedReady,
        },
        secondary: {
          instanceId: destroyedInstanceId,
          focus: secondaryFocus,
          destroyed: true,
          replacement: {
            instanceId: replacementId,
            mount: replacementMount,
            ready: replacementReady,
            active: replacementMount.ok && replacementReady?.ok === true,
          },
        },
        focusIsolation: {
          primaryHostContainsFocus: primaryHost.contains(document.activeElement),
          secondaryHostContainsFocus: secondaryHost.contains(document.activeElement),
          distinctInstanceIds: component.instanceId !== replacementId,
        },
      });
      return;
    }
    case 'frameworks':
      await runFrameworkIntegrationScenario(component, record);
      return;
    default:
      return;
  }
}

async function runFrameworkIntegrationScenario(
  mountedComponent: BomEditorComponent,
  input: JsonRecord,
): Promise<void> {
  const runtime = activeFrameworkRuntime;
  const host = document.querySelector<HTMLDivElement>(
    '[data-example-editor-host="frameworks"]',
  );
  if (runtime === null || host === null || runtime.component !== mountedComponent) {
    recordEmbeddedAction('frameworks', 'publicSdkLifecycle', {
      supported: false,
      reason: 'FRAMEWORK_RUNTIME_NOT_MOUNTED',
    });
    return;
  }

  const props = createFrameworkComponentProps(input, runtime.kind, runtime.component.instanceId);
  const sourceDocument = props.document as unknown as JsonRecord;
  const invalidDocument = {
    ...sourceDocument,
    revision: '',
  } as unknown as BomEditorComponentProps['document'];
  const rejectedUpdate = await captureUpdateResult(
    runtime.component,
    invalidDocument,
  );

  const requestedRevision = input['recoveryRevision'];
  const recoveryRevision = revisionValue(requestedRevision) ?? 2;
  const recoveryDocument = {
    ...sourceDocument,
    revision: typeof requestedRevision === 'string' ? String(recoveryRevision) : recoveryRevision,
    documentId: `${String(sourceDocument['documentId'] ?? 'demo-framework')}-recovered`,
  } as unknown as BomEditorComponentProps['document'];
  const recoveredUpdate = await captureUpdateResult(
    runtime.component,
    recoveryDocument,
  );

  const lifecycle = asRecord(input['lifecycle']);
  const shouldRemount = booleanValue(lifecycle?.['unmountRemount']) ?? true;
  const shouldRecreate = booleanValue(lifecycle?.['destroyRecreate']) ?? true;
  let unmounted: ReturnType<BomEditorComponent['unmount']> | null = null;
  let remounted: Awaited<ReturnType<BomEditorComponent['mount']>> | null = null;
  let remountedReady: Awaited<BomEditorComponent['ready']> | null = null;
  if (shouldRemount) {
    unmounted = runtime.unmount();
    remounted = unmounted.ok ? await runtime.mount(host) : null;
    remountedReady = remounted?.ok === true
      ? await runtime.component.ready
      : null;
  }

  const destroyedInstanceId = runtime.component.instanceId;
  let replacementId: string | null = null;
  let replacementMount: Awaited<ReturnType<BomEditorComponent['mount']>> | null = null;
  let replacementReady: Awaited<BomEditorComponent['ready']> | null = null;
  let replacementActive = false;
  if (shouldRecreate) {
    runtime.destroy();
    if (activeFrameworkRuntime === runtime) activeFrameworkRuntime = null;
    if (activeEmbeddedEditor === runtime.component) activeEmbeddedEditor = null;

    replacementId = `${destroyedInstanceId}-replacement`;
    const replacementProps = createFrameworkComponentProps(input, runtime.kind, replacementId);
    const replacement = createFrameworkRuntime(runtime.kind, replacementProps);
    activeFrameworkRuntime = replacement;
    activeEmbeddedEditor = replacement.component;
    replacementMount = await replacement.mount(host);
    replacementReady = replacementMount.ok
      ? await replacement.component.ready
      : null;
    replacementActive = replacementMount.ok && replacementReady?.ok === true;
    if (!replacementActive) {
      replacement.destroy();
      if (activeFrameworkRuntime === replacement) activeFrameworkRuntime = null;
      if (activeEmbeddedEditor === replacement.component) activeEmbeddedEditor = null;
    }
  }
  host.dataset['state'] = shouldRecreate && !replacementActive ? 'error' : 'ready';

  recordEmbeddedAction('frameworks', 'publicSdkLifecycle', {
    adapter: runtime.kind,
    input: {
      props: ['schema', 'document', 'columns', 'outputs'],
      recoveryRevision,
    },
    rejectedUpdate,
    recoveredUpdate,
    unmount: unmounted,
    remount: remounted,
    readyAfterRemount: remountedReady,
    destroyed: { instanceId: destroyedInstanceId, destroyed: shouldRecreate },
    replacement: shouldRecreate ? {
      instanceId: replacementId,
      mount: replacementMount,
      ready: replacementReady,
      active: replacementActive,
    } : null,
  });
}

async function captureUpdateResult(
  component: BomEditorComponent,
  document: BomEditorComponentProps['document'],
): Promise<Readonly<Record<string, unknown>>> {
  try {
    const result = await component.update({ document });
    return result.ok
      ? { ok: true, outcome: 'accepted' }
      : { ok: false, error: result.error };
  } catch (error) {
    return {
      ok: false,
      threw: error instanceof Error ? error.message : 'update 抛出未知错误',
    };
  }
}

function getExampleInstanceHost(
  exampleId: string,
  instance: 'primary' | 'secondary',
): HTMLElement | null {
  const host = document.querySelector<HTMLElement>(
    `[data-example-editor-host="${exampleId}"] [data-example-instance="${instance}"]`,
  );
  return host;
}

async function focusDemoInstance(
  component: BomEditorComponent,
  host: HTMLElement,
  occurrenceId: string,
): Promise<Readonly<Record<string, unknown>>> {
  const focused = component.focus();
  const selected = component.focusCell({ occurrenceId, columnId: 'materialCode' });
  const treegrid = host.querySelector<HTMLElement>('[role="treegrid"]');
  if (treegrid !== null) treegrid.focus({ preventScroll: true });
  await waitForDemoFrames(1);
  return {
    focused,
    selected,
    activeElementInHost: host.contains(document.activeElement),
    treegridMounted: treegrid !== null,
  };
}

function getExampleTreegrid(exampleId: string): HTMLElement | null {
  const host = document.querySelector<HTMLElement>(
    `[data-example-editor-host="${exampleId}"]`,
  );
  return host?.querySelector<HTMLElement>('[role="treegrid"]') ?? null;
}

async function runDemoCellEdit(
  exampleId: string,
  component: BomEditorComponent,
  address: Readonly<{ occurrenceId: string; columnId: string }>,
  value: string,
): Promise<Readonly<Record<string, unknown>>> {
  const focused = component.focus();
  const selected = component.focusCell(address);
  const treegrid = getExampleTreegrid(exampleId);
  if (!focused.ok || !selected.ok || treegrid === null) {
    return {
      focused,
      selected,
      committed: false,
      reason: treegrid === null ? 'TREEGRID_NOT_MOUNTED' : 'FOCUS_REJECTED',
    };
  }
  treegrid.focus({ preventScroll: true });
  const requested = await dispatchDemoKey(treegrid, { key: 'F2' });
  const host = document.querySelector<HTMLElement>(
    `[data-example-editor-host="${exampleId}"]`,
  );
  const portal = host?.querySelector<HTMLInputElement>(
    '[data-bom-editor-portal="true"]',
  );
  if (portal === null || portal === undefined || portal.hidden) {
    return { focused, selected, requested, committed: false, reason: 'EDITOR_PORTAL_UNAVAILABLE' };
  }
  portal.value = value;
  try {
    portal.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: value,
    }));
  } catch {
    portal.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const committed = await dispatchDemoKey(portal, { key: 'Enter' });
  return { focused, selected, requested, committed, portalClosed: portal.hidden };
}

async function dispatchDemoKey(
  target: HTMLElement,
  init: Readonly<KeyboardEventInit>,
): Promise<Readonly<Record<string, unknown>>> {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  const dispatched = target.dispatchEvent(event);
  await waitForDemoFrames(2);
  return { dispatched, defaultPrevented: event.defaultPrevented, key: event.key };
}

async function dispatchDemoPaste(
  target: HTMLElement,
  representations: Readonly<DemoClipboardRepresentations>,
): Promise<Readonly<Record<string, unknown>>> {
  target.focus({ preventScroll: true });
  try {
    const clipboardData = new DataTransfer();
    const types: string[] = [];
    if (representations.internal !== undefined) {
      clipboardData.setData(
        'application/x-bom-editor-clipboard+json',
        representations.internal,
      );
      types.push('internal');
    }
    if (representations.html !== undefined) {
      clipboardData.setData('text/html', representations.html);
      types.push('html');
    }
    if (representations.text !== undefined) {
      clipboardData.setData('text/plain', representations.text);
      types.push('text');
    }
    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData,
    });
    const dispatched = target.dispatchEvent(event);
    await waitForDemoFrames(3);
    return { dispatched, defaultPrevented: event.defaultPrevented, types };
  } catch {
    return { dispatched: false, reason: 'CLIPBOARD_EVENT_UNAVAILABLE' };
  }
}

async function waitForDemoFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }
}

function demoClipboardCellText(value: unknown): string {
  if (value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).replace(/[\t\r\n]/gu, ' ');
  }
  return JSON.stringify(value) ?? '';
}

interface DemoClipboardRepresentations {
  readonly internal?: string;
  readonly html?: string;
  readonly text?: string;
}

type DemoClipboardRepresentationsResult =
  | {
      readonly ok: true;
      readonly value: Readonly<DemoClipboardRepresentations>;
      readonly formats: readonly ('internal' | 'html' | 'text')[];
    }
  | {
      readonly ok: false;
      readonly errors: readonly string[];
    };

/**
 * Keeps the demo's textual row shorthand while allowing users to exercise the
 * real internal -> HTML -> text browser-paste precedence with raw candidates.
 */
function resolveDemoClipboardRepresentations(
  record: JsonRecord,
): DemoClipboardRepresentationsResult {
  const errors: string[] = [];
  const candidates: {
    internal?: string;
    html?: string;
    text?: string;
  } = {};
  const rawCandidates = record['candidates'];
  if (rawCandidates !== undefined) {
    const candidateRecord = asRecord(rawCandidates);
    if (candidateRecord === null) {
      errors.push('candidates 必须是对象');
    } else {
      const allowed = new Set(['internal', 'html', 'text']);
      for (const key of Object.keys(candidateRecord)) {
        if (!allowed.has(key)) errors.push(`candidates.${key} 不是支持的候选表示`);
      }
      for (const key of ['internal', 'html', 'text'] as const) {
        const value = candidateRecord[key];
        if (value === undefined) continue;
        if (typeof value !== 'string') {
          errors.push(`candidates.${key} 必须是字符串`);
          continue;
        }
        candidates[key] = value;
      }
    }
  }

  if (candidates.text === undefined && record['rows'] !== undefined) {
    const rows = record['rows'];
    if (
      !Array.isArray(rows) ||
      rows.length === 0 ||
      rows.some((row) => !Array.isArray(row))
    ) {
      errors.push('rows 必须是非空二维数组');
    } else {
      candidates.text = (rows as readonly (readonly unknown[])[])
        .map((row) => row.map(demoClipboardCellText).join('\t'))
        .join('\n');
    }
  }

  const formats = (['internal', 'html', 'text'] as const).filter(
    (format) => candidates[format] !== undefined,
  );
  if (formats.length === 0) {
    errors.push('必须提供 candidates 中至少一种表示，或提供 rows 生成 text');
  }
  if (errors.length > 0) {
    return { ok: false, errors: Object.freeze(errors) };
  }
  return {
    ok: true,
    value: Object.freeze(candidates),
    formats: Object.freeze(formats),
  };
}

function isDemoDiffKind(value: unknown): value is 'inserted' | 'deleted' | 'changed' | 'moved' | 'reordered' | 'material' {
  return value === 'inserted' || value === 'deleted' || value === 'changed' ||
    value === 'moved' || value === 'reordered' || value === 'material';
}

function createDemoImportOptions(record: JsonRecord): Readonly<Record<string, unknown>> {
  const input = asRecord(record['import']) ?? {};
  const format = input['format'] === 'csv' || input['format'] === 'tsv' || input['format'] === 'xlsx'
    ? input['format']
    : 'csv';
  const header = input['header'] === 'none' || input['header'] === 'firstRow'
    ? input['header']
    : 'firstRow';
  return {
    format,
    mode: input['mode'] === 'commit' ? 'commit' : 'preview',
    header,
    fieldIds: normalizeStringList(input['fieldIds']) ?? ['materialCode', 'name', 'quantity'],
  };
}

function createDemoExportOptions(record: JsonRecord): Readonly<Record<string, unknown>> {
  return createDemoExportOptionsFromInput(record['export']);
}

function createDemoExportOptionsList(record: JsonRecord): readonly Readonly<Record<string, unknown>>[] {
  const requested = Array.isArray(record['exports'])
    ? record['exports']
    : [record['export']];
  const options = requested.map((entry) => createDemoExportOptionsFromInput(entry));
  return options.length > 0 ? options : [createDemoExportOptions(record)];
}

function createDemoExportOptionsFromInput(inputValue: unknown): Readonly<Record<string, unknown>> {
  const input = asRecord(inputValue) ?? {};
  return {
    format: input['format'] === 'tsv' || input['format'] === 'xlsx' ? input['format'] : 'csv',
    mode: input['mode'] === 'completeData' || input['mode'] === 'roundTripTemplate'
      ? input['mode']
      : 'currentView',
    rowScope: input['rowScope'] === 'filtered' || input['rowScope'] === 'all'
      ? input['rowScope']
      : 'visible',
    fieldIds: normalizeStringList(input['fieldIds']) ?? ['materialCode', 'name', 'quantity'],
  };
}

const DEMO_HIGH_CONTRAST_THEME = Object.freeze({
  background: '#ffffff',
  frozenBackground: '#ffffff',
  rowAlternateBackground: '#f0f0f0',
  gridLine: '#000000',
  text: '#000000',
  activeCell: '#0037ff',
  activeCellFill: '#fff07a',
  rangeFill: '#c6ddff',
  fillPreviewFill: '#d5f5d9',
  fillPreviewBorder: '#006b22',
  expander: '#000000',
  diffAddedFill: '#b9f5c7',
  diffDeletedFill: '#ffd0d0',
  diffChangedFill: '#fff0a8',
  diffMarker: '#7a4300',
  font: '600 14px sans-serif',
});

function createDemoPresentationTheme(value: unknown): Readonly<Record<string, string>> | undefined {
  if (value === undefined || value === 'default') return undefined;
  if (value === 'highContrast') return DEMO_HIGH_CONTRAST_THEME;
  const input = asRecord(value);
  if (input === null) return undefined;
  const allowed = new Set([
    'background', 'frozenBackground', 'rowAlternateBackground', 'gridLine', 'text',
    'activeCell', 'activeCellFill', 'rangeFill', 'fillPreviewFill', 'fillPreviewBorder',
    'expander', 'diffAddedFill', 'diffDeletedFill', 'diffChangedFill', 'diffMarker', 'font',
  ]);
  const theme: Record<string, string> = {};
  for (const [key, candidate] of Object.entries(input)) {
    if (!allowed.has(key) || typeof candidate !== 'string' || candidate.trim().length === 0) continue;
    theme[key] = candidate.trim();
  }
  return Object.keys(theme).length > 0 ? Object.freeze(theme) : undefined;
}

function demoPresentationZoom(value: unknown): number {
  const zoom = finiteNumber(value);
  return zoom !== null && zoom >= 0.75 && zoom <= 1.5 ? zoom : 1;
}

function applyDemoPresentationZoom(
  exampleId: string,
  zoom: number,
): Readonly<Record<string, unknown>> {
  const host = document.querySelector<HTMLElement>(
    `[data-example-editor-host="${exampleId}"]`,
  );
  if (host === null) return { applied: false, reason: 'HOST_NOT_MOUNTED', zoom };
  host.style.setProperty('zoom', String(zoom));
  return {
    applied: host.style.getPropertyValue('zoom') === String(zoom),
    zoom,
    scope: 'host-browser-presentation',
  };
}

function createDemoPlugin(
  record: JsonRecord,
): Parameters<BomEditorComponent['installPlugin']>[0] | null {
  const manifest = asRecord(record['plugin']);
  if (manifest === null) return null;
  const id = nonEmptyString(manifest['id']);
  const name = nonEmptyString(manifest['name']);
  const version = nonEmptyString(manifest['version']);
  const abiVersion = nonEmptyString(manifest['abiVersion']);
  const engineRange = nonEmptyString(manifest['engineRange']);
  const capabilities = normalizeStringList(manifest['capabilities']);
  const permissions = manifest['permissions'] === undefined
    ? []
    : normalizeStringList(manifest['permissions']);
  if (
    id === null || name === null || version === null || abiVersion === null ||
    engineRange === null || capabilities === null || capabilities.length === 0 ||
    permissions === null
  ) {
    return null;
  }
  return {
    manifest: {
      id,
      name,
      version,
      abiVersion,
      engineRange,
      capabilities,
      permissions,
    },
    setup: () => () => undefined,
  } as Parameters<BomEditorComponent['installPlugin']>[0];
}

function buildExampleOutput(exampleId: string, input: unknown): Readonly<Record<string, unknown>> {
  const record = asRecord(input);
  if (record === null) throw new Error('输入必须是 JSON 对象');

  switch (exampleId) {
    case 'mount': {
      const schemaInput = asRecord(record['schema']);
      const documentInput = asRecord(record['document']);
      const rawColumns = record['columns'];
      const rawOutputs = record['outputs'];
      const errors: string[] = [];
      for (const key of Object.keys(record)) {
        if (!MOUNT_PROP_KEYS.has(key)) errors.push(`不支持的组件 Props: ${key}`);
      }
      const schema = normalizeMountSchema(schemaInput, errors);
      const snapshot = normalizeMountDocument(documentInput, schema, errors);
      if (!Array.isArray(rawColumns) || rawColumns.length === 0) {
        errors.push('columns 必须是至少包含一列的数组');
      }
      const normalizedColumns: Array<Readonly<Record<string, unknown>>> = [];
      const columnIds = new Set<string>();
      if (Array.isArray(rawColumns)) {
        rawColumns.forEach((candidate, index) => {
          const column = asRecord(candidate);
          const columnId = column === null ? null : nonEmptyString(column['columnId']);
          const label = column === null ? null : nonEmptyString(column['label']);
          const width = column === null ? null : finiteNumber(column['width']);
          if (columnId === null) errors.push(`columns[${index}].columnId 必须是非空字符串`);
          else if (columnIds.has(columnId)) errors.push(`columns[${index}].columnId 重复: ${columnId}`);
          else columnIds.add(columnId);
          if (label === null) errors.push(`columns[${index}].label 必须是非空字符串`);
          if (width === null || width < 40 || width > 2_000) {
            errors.push(`columns[${index}].width 必须是 40 到 2000 之间的数字`);
          }

          const fieldPath = parseFieldPath(column?.['fieldPath']);
          const fieldName = column?.['fieldName'] === undefined
            ? undefined
            : nonEmptyString(column['fieldName']);
          const visible = column?.['visible'] === undefined ? true : booleanValue(column['visible']);
          const frozen = column?.['frozen'] === undefined ? false : frozenValue(column['frozen']);
          const editable = column?.['editable'];
          const minWidth = column?.['minWidth'] === undefined ? undefined : finiteNumber(column['minWidth']);
          const maxWidth = column?.['maxWidth'] === undefined ? undefined : finiteNumber(column['maxWidth']);
          if (fieldPath === null) errors.push(`columns[${index}].fieldPath 必须是合法路径`);
          else if (schema !== null && !schema.fieldPaths.has(JSON.stringify(fieldPath))) {
            errors.push(`columns[${index}].fieldPath 不存在于 schema.fields`);
          }
          if (column?.['fieldName'] !== undefined && fieldName === null) {
            errors.push(`columns[${index}].fieldName 必须是非空字符串`);
          }
          const schemaField = schema === null || fieldPath === null
            ? undefined
            : schema.fields.find((field) => JSON.stringify(field.path) === JSON.stringify(fieldPath));
          if (fieldName !== undefined && fieldName !== null && schemaField !== undefined && fieldName !== schemaField.fieldId) {
            errors.push(`columns[${index}].fieldName 必须与 fieldPath 对应的 schema.fields[].fieldId 一致`);
          }
          if (visible === null) errors.push(`columns[${index}].visible 必须是布尔值`);
          if (frozen === null) errors.push(`columns[${index}].frozen 必须是 false、start 或 end`);
          if (typeof editable !== 'boolean') errors.push(`columns[${index}].editable 必须是布尔值`);
          if (minWidth === null) errors.push(`columns[${index}].minWidth 必须是正数`);
          if (maxWidth === null) errors.push(`columns[${index}].maxWidth 必须是不小于 minWidth 的正数`);
          if (minWidth !== undefined && minWidth !== null && minWidth <= 0) errors.push(`columns[${index}].minWidth 必须是正数`);
          if (maxWidth !== undefined && maxWidth !== null && maxWidth <= 0) errors.push(`columns[${index}].maxWidth 必须是正数`);
          if (minWidth !== undefined && maxWidth !== undefined && minWidth !== null && maxWidth !== null && maxWidth < minWidth) {
            errors.push(`columns[${index}].maxWidth 必须不小于 minWidth`);
          }
          if (minWidth !== undefined && minWidth !== null && width !== null && width < minWidth) errors.push(`columns[${index}].width 不能小于 minWidth`);
          if (maxWidth !== undefined && maxWidth !== null && width !== null && width > maxWidth) errors.push(`columns[${index}].width 不能大于 maxWidth`);
          if (column?.['alignment'] !== undefined && !['start', 'center', 'end'].includes(String(column['alignment']))) {
            errors.push(`columns[${index}].alignment 必须是 start、center 或 end`);
          }
          if (column?.['wrapText'] !== undefined && typeof column['wrapText'] !== 'boolean') {
            errors.push(`columns[${index}].wrapText 必须是布尔值`);
          }
          if (column?.['format'] !== undefined && !isMountColumnFormat(column['format'])) {
            errors.push(`columns[${index}].format 不是合法的显示格式`);
          }
          if (index === 0 && visible === false) errors.push('columns[0].visible 不能为 false');
          if (columnId !== null && label !== null && width !== null && width >= 40 && width <= 2_000 && fieldPath !== null && typeof editable === 'boolean' && visible !== null && frozen !== null && (minWidth === undefined || minWidth !== null) && (maxWidth === undefined || maxWidth !== null)) {
            normalizedColumns.push({
              ...column,
              columnId,
              ...(fieldName === undefined || fieldName === null ? {} : { fieldName }),
              fieldPath,
              label,
              width,
              editable,
              visible: visible ?? true,
              frozen: frozen ?? false,
            });
          }
        });
      }
      const outputs = normalizeStringList(rawOutputs);
      if (outputs === null) errors.push('outputs 必须是字符串数组');
      else if (outputs.length === 0) errors.push('outputs 至少需要一个输出名称');
      else {
        for (const output of outputs) {
          if (!COMPONENT_OUTPUT_KEYS.has(output)) errors.push(`outputs 包含未知输出: ${output}`);
        }
      }
      validateMountOptions(record, snapshot, schema, normalizedColumns, errors);
      if (errors.length > 0) {
        return rejected('bom-editor-component/v1', 'INVALID_MOUNT_INPUT', errors.join('；'), {
          schema: schema === null ? null : { schemaVersion: schema.schemaVersion, fieldCount: schema.fields.length },
          document: snapshot === null ? null : { documentId: snapshot.documentId, revision: snapshot.revision },
          normalized: { columnCount: normalizedColumns.length, outputCount: outputs?.length ?? 0 },
        });
      }
      return {
        protocol: 'bom-editor-component/v1',
        status: 'ready',
        schema: schema!.value,
        document: snapshot!.value,
        normalized: {
          columnCount: normalizedColumns.length,
          outputCount: outputs!.length,
          columns: normalizedColumns,
          outputs,
          options: summarizeMountOptions(record),
        },
        events: ['ready', ...outputs!],
      };
    }
    case 'edit': {
      const baseRevision = revisionValue(record['baseRevision']);
      const occurrenceId = nonEmptyString(record['occurrenceId']);
      const fieldPath = parseFieldPath(record['fieldPath']);
      const value = record['value'];
      const origin = nonEmptyString(record['origin']) ?? 'demo:edit';
      const type = record['type'] === undefined ? 'setField' : record['type'];
      const errors: string[] = [];
      if (baseRevision === null) errors.push('baseRevision 必须是非负整数或数字字符串');
      if (occurrenceId === null) errors.push('occurrenceId 必须是非空字符串');
      if (fieldPath === null) errors.push('fieldPath 必须是点号路径或非空字符串数组');
      if (type !== 'setField') errors.push('当前演练只支持 type=setField');
      if (!isJsonValue(value)) errors.push('value 必须是可序列化的 BOM 值');
      const before = findBeforeValue(record, occurrenceId, fieldPath);
      if (errors.length > 0) {
        return rejected('bom-editor-commit/v1', 'INVALID_EDIT_COMMAND', errors.join('；'), {
          commit: null,
          before: { present: before.present, value: before.value },
          after: isJsonValue(value) ? value : null,
        });
      }
      const sameValue = before.present && deepEqual(before.value, value);
      const nextRevision = incrementRevision(record['baseRevision'], baseRevision! + (sameValue ? 0 : 1));
      const transactionId = sameValue ? null : `tx-demo-${String(nextRevision)}-${occurrenceId}`;
      return {
        protocol: 'bom-editor-commit/v1',
        outcome: sameValue ? 'noop' : 'committed',
        command: { type, occurrenceId, fieldPath, value },
        before: { present: before.present, value: before.value },
        after: value,
        commit: sameValue
          ? null
          : {
            transactionId,
            origin,
            baseRevision: incrementRevision(record['baseRevision'], baseRevision!),
            revision: nextRevision,
            patchCount: 1,
            patch: {
              protocolVersion: 'bom-editor-patch/v1',
              baseRevision: incrementRevision(record['baseRevision'], baseRevision!),
              transactionId,
              origin,
              operations: [{
                op: 'updateField',
                occurrenceId,
                fieldPath,
                value,
                ...(before.present ? { beforeValue: before.value } : {}),
              }],
            },
          },
        undo: {
          available: !sameValue,
          restoresRevision: incrementRevision(record['baseRevision'], baseRevision!),
        },
      };
    }
    case 'view':
      return buildViewOutput(record);
    case 'search': {
      const rawQuery = record['query'];
      const query = typeof rawQuery === 'string' ? rawQuery : '';
      const mode = searchMode(record['mode']);
      const caseSensitive = record['caseSensitive'] === undefined ? false : booleanValue(record['caseSensitive']);
      const matchWholeCell = record['matchWholeCell'] === undefined ? false : booleanValue(record['matchWholeCell']);
      const rows = normalizeSearchRows(record['rows']);
      const limit = record['limit'] === undefined ? 100 : positiveInteger(record['limit']);
      if (typeof rawQuery !== 'string' || mode === null || caseSensitive === null || matchWholeCell === null || rows === null || limit === null) {
        return rejected('bom-editor-query-result/v1', 'INVALID_SEARCH_INPUT', 'query、mode、布尔选项、limit 和 rows 必须符合场景输入格式', {
          query,
          mode: mode ?? null,
          count: 0,
          matches: [],
        });
      }
      if (query.length === 0) {
        return {
          protocol: 'bom-editor-query-result/v1',
          status: 'empty',
          query,
          mode,
          caseSensitive,
          matchWholeCell,
          count: 0,
          returnedCount: 0,
          truncated: false,
          matches: [],
          displayFormat: record['format'] ?? { kind: 'text' },
        };
      }
      let regex: RegExp | null = null;
      if (mode === 'regex') {
        if (query.length > 512 || !isSafeSearchRegex(query)) {
          return rejected('bom-editor-query-result/v1', 'INVALID_SEARCH_REGEX', '正则表达式超过长度限制或包含不安全构造', { query, mode, count: 0, matches: [] });
        }
        try {
          regex = new RegExp(query.normalize('NFKC'), caseSensitive ? 'u' : 'iu');
        } catch {
          return rejected('bom-editor-query-result/v1', 'INVALID_SEARCH_REGEX', '正则表达式无法编译', { query, mode, count: 0, matches: [] });
        }
      }
      const matches = rows.flatMap((row, rowIndex) => {
        const candidates: Array<Readonly<{ columnId: string; value: string }>> = [];
        if (row.materialCode !== undefined) candidates.push({ columnId: 'materialCode', value: row.materialCode });
        for (const [columnId, rawValue] of Object.entries(row.values)) {
          if (columnId === 'materialCode' && row.materialCode !== undefined) continue;
          for (const valueText of valueTexts(rawValue)) candidates.push({ columnId, value: valueText });
        }
        return candidates.flatMap((candidate) => {
          const score = searchScoreFor(candidate.value, query, mode, caseSensitive, matchWholeCell, regex);
          return score === null ? [] : [{ occurrenceId: row.occurrenceId, columnId: candidate.columnId, rowIndex, score }];
        });
      });
      const limitedMatches = matches.slice(0, limit);
      return {
        protocol: 'bom-editor-query-result/v1',
        status: 'complete',
        query,
        mode,
        caseSensitive,
        matchWholeCell,
        count: matches.length,
        returnedCount: limitedMatches.length,
        truncated: limitedMatches.length < matches.length,
        matches: limitedMatches,
        displayFormat: record['format'] ?? { kind: 'text' },
      };
    }
    case 'clipboard':
      return buildClipboardOutput(record);
    case 'selection':
    case 'structure':
    case 'history':
    case 'query':
    case 'columns':
    case 'templates':
    case 'validation':
    case 'matching':
    case 'diff':
    case 'exchange':
    case 'presentation':
    case 'plugins':
    case 'lifecycle':
    case 'frameworks':
      return buildCapabilityScenarioOutput(exampleId, record);
    default:
      throw new Error('未知示例');
  }
}

function buildCapabilityScenarioOutput(
  exampleId: string,
  record: JsonRecord,
): Readonly<Record<string, unknown>> {
  const definition = CAPABILITY_EXAMPLE_BY_ID.get(exampleId);
  const errors = validateCapabilityScenarioInput(exampleId, record);
  if (errors.length > 0) {
    return rejected(
      'bom-editor-demo-scenario/v1',
      'INVALID_CAPABILITY_SCENARIO_INPUT',
      errors.join('；'),
      { exampleId, action: capabilityScenarioAction(exampleId) },
    );
  }
  return {
    protocol: 'bom-editor-demo-scenario/v1',
    status: 'ready',
    outcome: 'accepted',
    exampleId,
    title: definition?.title ?? exampleId,
    action: capabilityScenarioAction(exampleId),
    input: toDemoJson(record),
    note: '输入校验通过；运行后请查看 component.action 与 component.outputHistory 中的真实组件结果。',
  };
}

function capabilityScenarioAction(exampleId: string): string {
  const actions: Readonly<Record<string, string>> = {
    selection: 'fillSeries',
    structure: 'keyboardStructureMove',
    history: 'editUndoRedo',
    query: 'setViewQuery',
    columns: 'columnCommands',
    templates: 'captureAndApplyViewTemplate',
    validation: 'validate',
    matching: 'matchMaterials',
    diff: 'controlledUpdateWithDiff',
    exchange: 'importPreviewAndAllExports',
    presentation: 'configurePresentation',
    plugins: 'pluginLifecycle',
    lifecycle: 'multiInstanceLifecycle',
    frameworks: 'publicSdkLifecycle',
  };
  return actions[exampleId] ?? 'run';
}

function validateCapabilityScenarioInput(
  exampleId: string,
  record: JsonRecord,
): string[] {
  const errors: string[] = [];
  const requireCellAddress = (value: unknown, label: string): void => {
    const address = asRecord(value);
    if (
      address === null || nonEmptyString(address['occurrenceId']) === null ||
      nonEmptyString(address['columnId']) === null
    ) {
      errors.push(`${label} 必须包含非空 occurrenceId 和 columnId`);
    }
  };

  switch (exampleId) {
    case 'selection': {
      const selection = asRecord(record['selection']);
      if (selection === null) {
        errors.push('selection 必须是对象');
      } else {
        requireCellAddress(selection['anchor'], 'selection.anchor');
        requireCellAddress(selection['focus'], 'selection.focus');
      }
      if (record['action'] !== 'fillSeries') errors.push('action 必须为 fillSeries');
      break;
    }
    case 'structure': {
      if (nonEmptyString(record['sourceOccurrenceId']) === null) errors.push('sourceOccurrenceId 必须是非空字符串');
      if (nonEmptyString(record['targetOccurrenceId']) === null) errors.push('targetOccurrenceId 必须是非空字符串');
      if (record['position'] !== 'inside') errors.push('当前示例仅演练 position=inside');
      if (!Array.isArray(record['keyboard']) || record['keyboard'].some((item) => typeof item !== 'string')) {
        errors.push('keyboard 必须是字符串数组');
      }
      break;
    }
    case 'history': {
      const history = asRecord(record['history']);
      if (history === null || positiveInteger(history['maxEntries']) === null || positiveSafeInteger(history['maxBytes']) === null) {
        errors.push('history 必须包含正整数 maxEntries 和 maxBytes');
      }
      if (!Array.isArray(record['shortcuts']) || record['shortcuts'].some((item) => typeof item !== 'string')) {
        errors.push('shortcuts 必须是字符串数组');
      }
      break;
    }
    case 'query': {
      const query = asRecord(record['query']);
      if (query === null) errors.push('query 必须是对象');
      else {
        if (query['filters'] !== undefined && !Array.isArray(query['filters'])) errors.push('query.filters 必须是数组');
        if (query['sort'] !== undefined && !Array.isArray(query['sort'])) errors.push('query.sort 必须是数组');
      }
      break;
    }
    case 'columns': {
      const freeze = asRecord(record['freeze']);
      const insert = asRecord(record['insert']);
      if (freeze === null || nonEmptyString(freeze['columnId']) === null || frozenValue(freeze['frozen']) === null) {
        errors.push('freeze 必须包含 columnId 和 frozen=false|start|end');
      }
      if (
        insert === null || nonEmptyString(insert['referenceColumnId']) === null ||
        (insert['position'] !== 'before' && insert['position'] !== 'after') ||
        positiveInteger(insert['count']) === null
      ) {
        errors.push('insert 必须包含 referenceColumnId、before|after 和正整数 count');
      }
      if (normalizeStringList(record['deleteColumnIds']) === null) errors.push('deleteColumnIds 必须是字符串数组');
      break;
    }
    case 'templates':
      if (record['operation'] !== 'capture-and-apply') errors.push('operation 必须为 capture-and-apply');
      if (nonEmptyString(record['templateName']) === null) errors.push('templateName 必须是非空字符串');
      break;
    case 'validation':
      if (record['scope'] !== 'document' && record['scope'] !== 'visible' && record['scope'] !== 'selection') {
        errors.push('scope 必须是 document、visible 或 selection');
      }
      break;
    case 'matching': {
      if (nonEmptyString(record['query']) === null) errors.push('query 必须是非空字符串');
      if (positiveInteger(record['limit']) === null) errors.push('limit 必须是正整数');
      if (nonEmptyString(record['targetOccurrenceId']) === null) errors.push('targetOccurrenceId 必须是非空字符串');
      const selection = asRecord(record['selection']);
      const confidence = selection === null ? null : finiteNumber(selection['minConfidence']);
      const delta = selection === null ? null : finiteNumber(selection['minScoreDelta']);
      if (
        confidence === null || delta === null || confidence < 0 || confidence > 1 ||
        delta < 0 || delta > 1
      ) {
        errors.push('selection 必须包含 0 到 1 之间的 minConfidence 和 minScoreDelta');
      }
      break;
    }
    case 'diff':
      if (nonEmptyString(record['changedOccurrenceId']) === null) errors.push('changedOccurrenceId 必须是非空字符串');
      if (nonEmptyString(record['changedColumnId']) === null) errors.push('changedColumnId 必须是非空字符串');
      if (!isDemoDiffKind(record['kind'])) errors.push('kind 必须是合法 Diff 类别');
      if (revisionValue(record['nextRevision']) === null) errors.push('nextRevision 必须是非负整数或数字字符串');
      break;
    case 'exchange': {
      if (typeof record['csv'] !== 'string' || record['csv'].length === 0) errors.push('csv 必须是非空字符串');
      const importOptions = asRecord(record['import']);
      const exportOptions = Array.isArray(record['exports'])
        ? record['exports'].map((entry) => asRecord(entry))
        : [asRecord(record['export'])];
      if (importOptions === null || importOptions['mode'] !== 'preview') errors.push('import.mode 必须为 preview');
      if (exportOptions.some((entry) => entry === null)) {
        errors.push('exports 必须是导出配置对象数组');
      } else {
        const modes = exportOptions.map((entry) => String(entry!['mode']));
        for (const mode of ['currentView', 'completeData', 'roundTripTemplate']) {
          if (!modes.includes(mode)) errors.push(`exports 必须包含 ${mode} 导出模式`);
        }
      }
      break;
    }
    case 'presentation': {
      if (record['locale'] !== 'zh-CN' && record['locale'] !== 'en-US') {
        errors.push('locale 必须是 zh-CN 或 en-US');
      }
      if (record['direction'] !== 'ltr' && record['direction'] !== 'rtl') errors.push('direction 必须是 ltr 或 rtl');
      if (nonEmptyString(record['announcement']) === null) errors.push('announcement 必须是非空字符串');
      const shortcuts = asRecord(record['shortcuts']);
      if (shortcuts === null) errors.push('shortcuts 必须是对象');
      if (record['theme'] !== undefined && record['theme'] !== 'default' && record['theme'] !== 'highContrast' && asRecord(record['theme']) === null) {
        errors.push('theme 必须是 default、highContrast 或主题 token 对象');
      }
      if (record['zoom'] !== undefined && (finiteNumber(record['zoom']) === null || (record['zoom'] as number) < 0.75 || (record['zoom'] as number) > 1.5)) {
        errors.push('zoom 必须是 0.75 到 1.5 之间的数字');
      }
      break;
    }
    case 'plugins': {
      const plugin = asRecord(record['plugin']);
      if (
        plugin === null || nonEmptyString(plugin['id']) === null ||
        nonEmptyString(plugin['name']) === null || nonEmptyString(plugin['version']) === null ||
        nonEmptyString(plugin['abiVersion']) === null || nonEmptyString(plugin['engineRange']) === null ||
        (normalizeStringList(plugin['capabilities']) ?? []).length === 0 ||
        (plugin['permissions'] !== undefined && normalizeStringList(plugin['permissions']) === null)
      ) {
        errors.push('plugin 必须包含完整 manifest，capabilities/permissions 必须是字符串数组');
      }
      break;
    }
    case 'lifecycle': {
      for (const key of ['primaryInstanceId', 'secondaryInstanceId', 'replacementInstanceId']) {
        if (nonEmptyString(record[key]) === null) errors.push(`${key} 必须是非空字符串`);
      }
      const ids = ['primaryInstanceId', 'secondaryInstanceId', 'replacementInstanceId']
        .map((key) => nonEmptyString(record[key]));
      if (new Set(ids).size !== ids.length) errors.push('三个 instanceId 必须互不相同');
      break;
    }
    case 'frameworks': {
      if (frameworkAdapterKind(record['adapter']) === null) {
        errors.push('adapter 必须是 native、react、vue 或 umd');
      }
      if (nonEmptyString(record['instanceId']) === null) {
        errors.push('instanceId 必须是非空字符串');
      }
      if (revisionValue(record['recoveryRevision']) === null) {
        errors.push('recoveryRevision 必须是非负整数或数字字符串');
      }
      const lifecycle = asRecord(record['lifecycle']);
      if (
        lifecycle === null || booleanValue(lifecycle['unmountRemount']) === null ||
        booleanValue(lifecycle['destroyRecreate']) === null
      ) {
        errors.push('lifecycle 必须包含布尔值 unmountRemount 和 destroyRecreate');
      }
      break;
    }
    default:
      errors.push('未知能力示例');
  }
  return errors;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 10_000 ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function frozenValue(value: unknown): false | 'start' | 'end' | null {
  return value === false || value === 'start' || value === 'end' ? value : null;
}

interface MountFieldModel {
  readonly fieldId: string;
  readonly path: readonly string[];
  readonly required: boolean;
  readonly nullable: boolean;
  readonly type: JsonRecord;
}

interface MountSchemaModel {
  readonly value: JsonRecord;
  readonly schemaVersion: string;
  readonly fields: readonly MountFieldModel[];
  readonly fieldPaths: ReadonlySet<string>;
}

interface MountNodeModel {
  readonly occurrenceId: string;
  readonly parentId: string | null;
  readonly fields: JsonRecord;
}

interface MountDocumentModel {
  readonly value: JsonRecord;
  readonly documentId: string;
  readonly revision: string;
  readonly roots: readonly string[];
  readonly nodes: readonly MountNodeModel[];
}

function normalizeMountSchema(
  input: JsonRecord | null,
  errors: string[],
): MountSchemaModel | null {
  if (input === null) {
    errors.push('schema 必须是对象');
    return null;
  }
  const schemaVersion = nonEmptyString(input['schemaVersion']);
  const canonicalizationVersion = nonEmptyString(input['canonicalizationVersion']);
  const allowAdditionalFields = booleanValue(input['allowAdditionalFields']);
  const recommendedDepth = positiveInteger(input['recommendedDepth']);
  const maximumDepth = positiveInteger(input['maximumDepth']);
  if (schemaVersion === null) errors.push('schema.schemaVersion 必须是非空字符串');
  if (canonicalizationVersion === null) errors.push('schema.canonicalizationVersion 必须是非空字符串');
  if (allowAdditionalFields === null) errors.push('schema.allowAdditionalFields 必须是布尔值');
  if (recommendedDepth === null) errors.push('schema.recommendedDepth 必须是正整数');
  if (maximumDepth === null) errors.push('schema.maximumDepth 必须是正整数');
  if (recommendedDepth !== null && maximumDepth !== null && recommendedDepth > maximumDepth) {
    errors.push('schema.recommendedDepth 不能大于 maximumDepth');
  }
  if (input['contentHashAlgorithm'] !== 'SHA-256') errors.push('schema.contentHashAlgorithm 必须是 SHA-256');

  const fieldsInput = input['fields'];
  const fields: MountFieldModel[] = [];
  const fieldIds = new Set<string>();
  const fieldPaths = new Set<string>();
  if (!Array.isArray(fieldsInput) || fieldsInput.length === 0) {
    errors.push('schema.fields 必须是非空数组');
  } else {
    fieldsInput.forEach((candidate, index) => {
      const field = asRecord(candidate);
      const fieldId = field === null ? null : nonEmptyString(field['fieldId']);
      const path = field === null ? null : parseFieldPath(field['path']);
      const required = field === null ? null : booleanValue(field['required']);
      const nullable = field === null ? null : booleanValue(field['nullable']);
      const type = field === null ? null : asRecord(field['type']);
      if (fieldId === null) errors.push(`schema.fields[${index}].fieldId 必须是非空字符串`);
      else if (fieldIds.has(fieldId)) errors.push(`schema.fields[${index}].fieldId 重复: ${fieldId}`);
      else fieldIds.add(fieldId);
      if (path === null) errors.push(`schema.fields[${index}].path 必须是合法路径`);
      else if (fieldPaths.has(JSON.stringify(path))) errors.push(`schema.fields[${index}].path 重复`);
      else fieldPaths.add(JSON.stringify(path));
      if (required === null) errors.push(`schema.fields[${index}].required 必须是布尔值`);
      if (nullable === null) errors.push(`schema.fields[${index}].nullable 必须是布尔值`);
      if (type === null || !isMountFieldType(type)) errors.push(`schema.fields[${index}].type 不是合法字段类型`);
      if (fieldId !== null && path !== null && required !== null && nullable !== null && type !== null && isMountFieldType(type)) {
        fields.push({ fieldId, path, required, nullable, type });
      }
    });
  }
  if (schemaVersion === null || canonicalizationVersion === null || allowAdditionalFields === null || recommendedDepth === null || maximumDepth === null || fields.length === 0) {
    return null;
  }
  return {
    value: input,
    schemaVersion,
    fields,
    fieldPaths,
  };
}

function normalizeMountDocument(
  input: JsonRecord | null,
  schema: MountSchemaModel | null,
  errors: string[],
): MountDocumentModel | null {
  if (input === null) {
    errors.push('document 必须是对象');
    return null;
  }
  const schemaVersion = nonEmptyString(input['schemaVersion']);
  const documentId = nonEmptyString(input['documentId']);
  const revision = nonEmptyString(input['revision']);
  const codec = input['positionKeyCodecVersion'];
  const completeness = input['completeness'];
  if (schemaVersion === null) errors.push('document.schemaVersion 必须是非空字符串');
  if (schema !== null && schemaVersion !== null && schemaVersion !== schema.schemaVersion) errors.push('document.schemaVersion 必须与 schema.schemaVersion 一致');
  if (documentId === null) errors.push('document.documentId 必须是非空字符串');
  if (revision === null) errors.push('document.revision 必须是非空字符串');
  if (codec !== 'lexicographic-ascii-v1') errors.push('document.positionKeyCodecVersion 不受支持');
  if (completeness !== 'complete' && completeness !== 'partial') errors.push('document.completeness 必须是 complete 或 partial');

  const rootsInput = input['roots'];
  const roots: string[] = [];
  const rootIds = new Set<string>();
  if (!Array.isArray(rootsInput) || rootsInput.length === 0) {
    errors.push('document.roots 必须是非空数组');
  } else {
    rootsInput.forEach((candidate, index) => {
      const root = nonEmptyString(candidate);
      if (root === null) errors.push(`document.roots[${index}] 必须是非空字符串`);
      else if (rootIds.has(root)) errors.push(`document.roots[${index}] 重复: ${root}`);
      else {
        rootIds.add(root);
        roots.push(root);
      }
    });
  }
  const knownRootCount = input['knownRootCount'] === undefined ? undefined : nonNegativeInteger(input['knownRootCount']);
  if (input['knownRootCount'] !== undefined && knownRootCount === null) errors.push('document.knownRootCount 必须是非负整数');
  if (knownRootCount !== undefined && knownRootCount !== null && knownRootCount !== roots.length) errors.push('document.knownRootCount 必须等于 roots.length');

  const nodesInput = input['nodes'];
  const nodes: MountNodeModel[] = [];
  const nodeIds = new Set<string>();
  if (!Array.isArray(nodesInput) || nodesInput.length === 0) {
    errors.push('document.nodes 必须是非空数组');
  } else {
    nodesInput.forEach((candidate, index) => {
      const node = asRecord(candidate);
      const occurrenceId = node === null ? null : nonEmptyString(node['occurrenceId']);
      const kind = node?.['kind'];
      const parentId = node === null || node['parentId'] === null ? null : nonEmptyString(node['parentId']);
      const positionKey = node === null ? null : nonEmptyString(node['positionKey']);
      const fields = node === null ? null : asRecord(node['fields']);
      if (occurrenceId === null) errors.push(`document.nodes[${index}].occurrenceId 必须是非空字符串`);
      else if (nodeIds.has(occurrenceId)) errors.push(`document.nodes[${index}].occurrenceId 重复: ${occurrenceId}`);
      else nodeIds.add(occurrenceId);
      if (kind !== 'material' && kind !== 'group') errors.push(`document.nodes[${index}].kind 必须是 material 或 group`);
      if (node !== null && node['parentId'] !== null && parentId === null) errors.push(`document.nodes[${index}].parentId 必须是字符串或 null`);
      if (positionKey === null || !/^[\x20-\x7e]{1,128}$/u.test(positionKey)) errors.push(`document.nodes[${index}].positionKey 必须是可打印 ASCII 字符串`);
      if (fields === null) errors.push(`document.nodes[${index}].fields 必须是对象`);
      if (node !== null && node['childrenState'] !== undefined && !['complete', 'partial', 'unloaded'].includes(String(node['childrenState']))) errors.push(`document.nodes[${index}].childrenState 不合法`);
      if (node !== null && node['knownChildCount'] !== undefined && nonNegativeInteger(node['knownChildCount']) === null) errors.push(`document.nodes[${index}].knownChildCount 必须是非负整数`);
      if (occurrenceId !== null && parentId !== null && parentId === occurrenceId) errors.push(`document.nodes[${index}] 不能把自己作为 parentId`);
      if (occurrenceId !== null && fields !== null && (schema === null || validateMountNodeFields(fields, schema, index, errors))) {
        nodes.push({ occurrenceId, parentId, fields });
      }
    });
  }

  for (const node of nodes) {
    if (node.parentId !== null && !nodeIds.has(node.parentId)) errors.push(`document.nodes[${node.occurrenceId}].parentId 不存在: ${node.parentId}`);
    if (node.parentId === null && !rootIds.has(node.occurrenceId)) errors.push(`节点 ${node.occurrenceId} 没有 parentId，但不在 roots 中`);
    if (node.parentId !== null && rootIds.has(node.occurrenceId)) errors.push(`节点 ${node.occurrenceId} 有 parentId，不能同时出现在 roots 中`);
  }
  for (const root of roots) {
    if (!nodeIds.has(root)) errors.push(`document.roots 引用了不存在的节点: ${root}`);
  }
  for (const node of nodes) {
    const visited = new Set<string>();
    let cursor: MountNodeModel | undefined = node;
    while (cursor?.parentId !== null && cursor !== undefined) {
      if (visited.has(cursor.occurrenceId)) {
        errors.push(`document.nodes[${node.occurrenceId}] 存在父级循环`);
        break;
      }
      visited.add(cursor.occurrenceId);
      cursor = nodes.find((candidate) => candidate.occurrenceId === cursor?.parentId);
      if (cursor === undefined) break;
    }
  }
  if (schemaVersion === null || documentId === null || revision === null || completeness === undefined || roots.length === 0 || nodes.length === 0) return null;
  return { value: input, documentId, revision, roots, nodes };
}

function validateMountNodeFields(
  fields: JsonRecord,
  schema: MountSchemaModel,
  nodeIndex: number,
  errors: string[],
): boolean {
  let valid = true;
  for (const field of schema.fields) {
    const found = readMountPath(fields, field.path);
    if (!found.present) {
      if (field.required) {
        errors.push(`document.nodes[${nodeIndex}].fields 缺少必填字段: ${field.fieldId}`);
        valid = false;
      }
      continue;
    }
    if (found.value === null) {
      if (!field.nullable) {
        errors.push(`document.nodes[${nodeIndex}].fields.${field.fieldId} 不允许为 null`);
        valid = false;
      }
    } else if (!matchesMountFieldType(found.value, field.type)) {
      errors.push(`document.nodes[${nodeIndex}].fields.${field.fieldId} 与 Schema 类型不匹配`);
      valid = false;
    }
  }
  if (!schema.value['allowAdditionalFields'] && Object.keys(fields).some((key) => !schema.fields.some((field) => field.path[0] === key))) {
    errors.push(`document.nodes[${nodeIndex}].fields 含有 Schema 禁止的额外字段`);
    valid = false;
  }
  return valid;
}

function readMountPath(value: JsonRecord, path: readonly string[]): { readonly present: boolean; readonly value: unknown } {
  let cursor: unknown = value;
  for (const segment of path) {
    const record = asRecord(cursor);
    if (record === null || !Object.prototype.hasOwnProperty.call(record, segment)) return { present: false, value: undefined };
    cursor = record[segment];
  }
  return { present: true, value: cursor };
}

function isMountFieldType(type: JsonRecord): boolean {
  const kind = type['kind'];
  switch (kind) {
    case 'string':
      return type['maxLength'] === undefined || (nonNegativeInteger(type['maxLength']) !== null);
    case 'boolean':
      return true;
    case 'integer':
      return (type['min'] === undefined || nonEmptyString(type['min']) !== null) && (type['max'] === undefined || nonEmptyString(type['max']) !== null);
    case 'decimal':
      return nonEmptyString(type['roundingMode']) !== null && (type['maxScale'] === undefined || nonNegativeInteger(type['maxScale']) !== null) && (type['unitFamily'] === undefined || nonEmptyString(type['unitFamily']) !== null);
    case 'date':
      return type['representation'] === 'iso-date';
    case 'datetime':
      return type['representation'] === 'iso-instant';
    case 'enum':
      return Array.isArray(type['values']) && type['values'].length > 0 && normalizeStringList(type['values'])?.length === type['values'].length;
    case 'json':
      return positiveSafeInteger(type['maxBytes']) !== null;
    default:
      return false;
  }
}

function matchesMountFieldType(value: unknown, type: JsonRecord): boolean {
  switch (type['kind']) {
    case 'string':
      return typeof value === 'string' && (type['maxLength'] === undefined || [...value].length <= Number(type['maxLength']));
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer': {
      if (!Number.isSafeInteger(value)) return false;
      const numeric = value as number;
      const minimum = type['min'] === undefined ? undefined : Number(type['min']);
      const maximum = type['max'] === undefined ? undefined : Number(type['max']);
      return (minimum === undefined || numeric >= minimum) && (maximum === undefined || numeric <= maximum);
    }
    case 'decimal':
      return typeof value === 'number' && Number.isFinite(value);
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value);
    case 'datetime':
      return typeof value === 'string' && !Number.isNaN(Date.parse(value));
    case 'enum':
      return typeof value === 'string' && Array.isArray(type['values']) && type['values'].includes(value);
    case 'json':
      return isJsonValue(value);
    default:
      return false;
  }
}

function validateMountOptions(
  record: JsonRecord,
  snapshot: MountDocumentModel | null,
  schema: MountSchemaModel | null,
  columns: readonly Readonly<Record<string, unknown>>[],
  errors: string[],
): void {
  for (const key of ['instanceId', 'protocolVersion']) {
    if (record[key] !== undefined && nonEmptyString(record[key]) === null) errors.push(`${key} 必须是非空字符串`);
  }
  const initialView = record['initialView'];
  if (initialView !== undefined) {
    validateInitialView(initialView, snapshot, schema, columns, errors);
  }
  if (record['rowHeight'] !== undefined && (finiteNumber(record['rowHeight']) === null || (record['rowHeight'] as number) <= 0)) errors.push('rowHeight 必须是正数');
  const expandedIds = record['expandedIds'];
  if (expandedIds !== undefined) {
    const normalized = normalizeStringList(expandedIds);
    if (normalized === null) errors.push('expandedIds 必须是字符串数组');
    else if (snapshot !== null) {
      const nodeIds = new Set(snapshot.nodes.map((node) => node.occurrenceId));
      for (const id of normalized) if (!nodeIds.has(id)) errors.push(`expandedIds 引用了不存在的节点: ${id}`);
    }
  }
  if (record['expandAll'] !== undefined && booleanValue(record['expandAll']) === null) errors.push('expandAll 必须是布尔值');
  validatePositiveOptionRecord(record['history'], 'history', errors);
  validatePositiveOptionRecord(record['pasteLimits'], 'pasteLimits', errors);
  const navigation = record['editNavigation'];
  if (navigation !== undefined) {
    const value = asRecord(navigation);
    if (value === null || (value['enter'] !== undefined && value['enter'] !== 'down' && value['enter'] !== 'none') || (value['tab'] !== undefined && value['tab'] !== 'next-editable' && value['tab'] !== 'none')) errors.push('editNavigation 必须只包含 enter=down|none 和 tab=next-editable|none');
  }
  const shortcuts = record['shortcuts'];
  if (shortcuts !== undefined) {
    const value = asRecord(shortcuts);
    if (value === null) errors.push('shortcuts 必须是对象');
    else {
      if (value['sequenceTimeoutMs'] !== undefined && positiveInteger(value['sequenceTimeoutMs']) === null) errors.push('shortcuts.sequenceTimeoutMs 必须是正整数');
      if (value['bindings'] !== undefined && !Array.isArray(value['bindings'])) errors.push('shortcuts.bindings 必须是数组');
    }
  }
  for (const key of ['clipboardPolicy', 'exportPolicy', 'pastePolicy', 'plugins', 'pluginGrantPolicy', 'matchApprovalPolicy', 'logger']) {
    if (record[key] !== undefined) errors.push(`${key} 是函数型配置，必须通过 TypeScript Props 传入`);
  }
  if (record['pluginHostConfiguration'] !== undefined && asRecord(record['pluginHostConfiguration']) === null) errors.push('pluginHostConfiguration 必须是对象');
  if (record['renderer'] !== undefined && asRecord(record['renderer']) === null) errors.push('renderer 必须是对象');
}

function validatePositiveOptionRecord(value: unknown, name: string, errors: string[]): void {
  if (value === undefined) return;
  const record = asRecord(value);
  if (record === null) {
    errors.push(`${name} 必须是对象`);
    return;
  }
  for (const [key, raw] of Object.entries(record)) {
    if (positiveSafeInteger(raw) === null) errors.push(`${name}.${key} 必须是正整数`);
  }
}

function validateInitialView(
  value: unknown,
  snapshot: MountDocumentModel | null,
  schema: MountSchemaModel | null,
  columns: readonly Readonly<Record<string, unknown>>[],
  errors: string[],
): void {
  const view = asRecord(value);
  if (view === null) {
    errors.push('initialView 必须是对象');
    return;
  }
  const allowed = new Set(['columns', 'rowHeight', 'expandedIds', 'expandAll', 'query', 'selection', 'scrollLeft', 'scrollTop']);
  for (const key of Object.keys(view)) {
    if (!allowed.has(key)) errors.push(`initialView.${key} 不是支持的配置项`);
  }
  if (view['rowHeight'] !== undefined && (finiteNumber(view['rowHeight']) === null || (view['rowHeight'] as number) <= 0)) errors.push('initialView.rowHeight 必须是正数');
  const expandedIds = view['expandedIds'];
  if (expandedIds !== undefined) {
    const normalized = normalizeStringList(expandedIds);
    if (normalized === null) errors.push('initialView.expandedIds 必须是字符串数组');
    else if (snapshot !== null) {
      const nodeIds = new Set(snapshot.nodes.map((node) => node.occurrenceId));
      for (const id of normalized) if (!nodeIds.has(id)) errors.push(`initialView.expandedIds 引用了不存在的节点: ${id}`);
    }
  }
  if (view['expandAll'] !== undefined && booleanValue(view['expandAll']) === null) errors.push('initialView.expandAll 必须是布尔值');
  if (view['expandAll'] === true && Array.isArray(expandedIds) && expandedIds.length > 0) errors.push('initialView.expandAll 不能与 expandedIds 同时启用');
  validateInitialViewColumns(view['columns'], columns, errors);
  for (const key of ['scrollLeft', 'scrollTop']) {
    if (view[key] !== undefined && (finiteNumber(view[key]) === null || (view[key] as number) < 0)) errors.push(`initialView.${key} 必须是非负数`);
  }
  validateInitialViewQuery(view['query'], schema, errors);
  const selection = view['selection'];
  if (selection !== undefined && selection !== null && asRecord(selection) === null) errors.push('initialView.selection 必须是对象或 null');
}

function validateInitialViewQuery(
  value: unknown,
  schema: MountSchemaModel | null,
  errors: string[],
): void {
  if (value === undefined) return;
  const query = asRecord(value);
  if (query === null) {
    errors.push('initialView.query 必须是对象');
    return;
  }
  const allowed = new Set(['filters', 'sort']);
  for (const key of Object.keys(query)) {
    if (!allowed.has(key)) errors.push(`initialView.query.${key} 不是支持的配置项`);
  }
  const filters = query['filters'];
  if (filters !== undefined && !Array.isArray(filters)) {
    errors.push('initialView.query.filters 必须是数组');
  } else if (Array.isArray(filters)) {
    filters.forEach((candidate, index) => {
      const filter = asRecord(candidate);
      if (filter === null) {
        errors.push(`initialView.query.filters[${index}] 必须是对象`);
        return;
      }
      const filterKeys = new Set(['fieldPath', 'operator', 'value']);
      for (const key of Object.keys(filter)) {
        if (!filterKeys.has(key)) errors.push(`initialView.query.filters[${index}].${key} 不是支持的配置项`);
      }
      const fieldPath = parseFieldPath(filter['fieldPath']);
      if (fieldPath === null) errors.push(`initialView.query.filters[${index}].fieldPath 必须是合法路径`);
      else if (schema !== null && !schema.fieldPaths.has(JSON.stringify(fieldPath))) errors.push(`initialView.query.filters[${index}].fieldPath 不存在于 schema.fields`);
      if (!['contains', 'equals', 'startsWith', 'gt', 'gte', 'lt', 'lte'].includes(String(filter['operator']))) {
        errors.push(`initialView.query.filters[${index}].operator 不支持`);
      }
      if (!Object.prototype.hasOwnProperty.call(filter, 'value') || !isJsonValue(filter['value'])) {
        errors.push(`initialView.query.filters[${index}].value 必须是合法 BomValue`);
      }
    });
  }
  const sort = query['sort'];
  if (sort !== undefined && !Array.isArray(sort)) {
    errors.push('initialView.query.sort 必须是数组');
  } else if (Array.isArray(sort)) {
    sort.forEach((candidate, index) => {
      const entry = asRecord(candidate);
      if (entry === null) {
        errors.push(`initialView.query.sort[${index}] 必须是对象`);
        return;
      }
      const sortKeys = new Set(['fieldPath', 'direction']);
      for (const key of Object.keys(entry)) {
        if (!sortKeys.has(key)) errors.push(`initialView.query.sort[${index}].${key} 不是支持的配置项`);
      }
      const fieldPath = parseFieldPath(entry['fieldPath']);
      if (fieldPath === null) errors.push(`initialView.query.sort[${index}].fieldPath 必须是合法路径`);
      else if (schema !== null && !schema.fieldPaths.has(JSON.stringify(fieldPath))) errors.push(`initialView.query.sort[${index}].fieldPath 不存在于 schema.fields`);
      if (entry['direction'] !== 'asc' && entry['direction'] !== 'desc') {
        errors.push(`initialView.query.sort[${index}].direction 必须是 asc 或 desc`);
      }
    });
  }
}

function validateInitialViewColumns(
  value: unknown,
  columns: readonly Readonly<Record<string, unknown>>[],
  errors: string[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push('initialView.columns 必须是数组');
    return;
  }
  if (value.length !== columns.length) {
    errors.push('initialView.columns 必须恰好包含每个 columns.columnId 一次');
  }
  const baseById = new Map(
    columns.map((column) => [String(column['columnId']), column]),
  );
  const seen = new Set<string>();
  const allowed = new Set(['columnId', 'width', 'frozen', 'visible']);
  value.forEach((candidate, index) => {
    const state = asRecord(candidate);
    if (state === null) {
      errors.push(`initialView.columns[${index}] 必须是对象`);
      return;
    }
    for (const key of Object.keys(state)) {
      if (!allowed.has(key)) errors.push(`initialView.columns[${index}].${key} 不是支持的配置项`);
    }
    const columnId = nonEmptyString(state['columnId']);
    const width = finiteNumber(state['width']);
    const frozen = frozenValue(state['frozen']);
    const visible = booleanValue(state['visible']);
    if (columnId === null) errors.push(`initialView.columns[${index}].columnId 必须是非空字符串`);
    else if (seen.has(columnId)) errors.push(`initialView.columns[${index}].columnId 重复: ${columnId}`);
    else seen.add(columnId);
    if (width === null || width <= 0) errors.push(`initialView.columns[${index}].width 必须是正数`);
    if (frozen === null) errors.push(`initialView.columns[${index}].frozen 必须是 false、start 或 end`);
    if (visible === null) errors.push(`initialView.columns[${index}].visible 必须是布尔值`);
    const base = columnId === null ? undefined : baseById.get(columnId);
    if (columnId !== null && base === undefined) {
      errors.push(`initialView.columns[${index}] 引用了未知列: ${columnId}`);
    }
    if (base !== undefined && width !== null) {
      const minimum = typeof base['minWidth'] === 'number' ? base['minWidth'] : undefined;
      const maximum = typeof base['maxWidth'] === 'number' ? base['maxWidth'] : undefined;
      if (minimum !== undefined && width < minimum) errors.push(`initialView.columns[${index}].width 不能小于 columns.${columnId}.minWidth`);
      if (maximum !== undefined && width > maximum) errors.push(`initialView.columns[${index}].width 不能大于 columns.${columnId}.maxWidth`);
    }
    if (index === 0 && columns[0] !== undefined && columnId !== String(columns[0]['columnId'])) {
      errors.push('initialView.columns 必须保留第一列在首位');
    }
    if (index === 0 && visible !== null && visible !== true) {
      errors.push('initialView.columns 的第一列必须可见');
    }
  });
  if (seen.size !== baseById.size) {
    errors.push('initialView.columns 必须恰好包含每个 columns.columnId 一次');
  }
}

function positiveSafeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function summarizeMountOptions(record: JsonRecord): Readonly<Record<string, unknown>> {
  const options: JsonRecord = {};
  for (const key of ['instanceId', 'protocolVersion', 'initialView', 'rowHeight', 'expandedIds', 'expandAll', 'history', 'pasteLimits', 'editNavigation', 'shortcuts', 'diffView', 'renderer']) {
    if (record[key] !== undefined) options[key] = record[key];
  }
  options['functionProps'] = ['clipboardPolicy', 'exportPolicy', 'pastePolicy', 'plugins', 'pluginGrantPolicy', 'pluginHostConfiguration', 'matchApprovalPolicy', 'logger'];
  return options;
}

function isMountColumnFormat(value: unknown): boolean {
  const format = asRecord(value);
  if (format === null) return false;
  const kind = format['kind'];
  if (!['text', 'integer', 'decimal', 'percent', 'currency', 'accounting', 'scientific', 'fraction', 'date', 'datetime'].includes(String(kind))) return false;
  for (const key of ['minimumFractionDigits', 'maximumFractionDigits', 'maximumDenominator']) {
    if (format[key] !== undefined && (nonNegativeInteger(format[key]) === null || (key === 'maximumDenominator' && (format[key] as number) < 2))) return false;
  }
  if ((kind === 'currency' || kind === 'accounting') && !/^[A-Z]{3}$/u.test(String(format['currency'] ?? ''))) return false;
  if (format['useGrouping'] !== undefined && typeof format['useGrouping'] !== 'boolean') return false;
  if (format['dateStyle'] !== undefined && !['short', 'medium', 'long', 'full'].includes(String(format['dateStyle']))) return false;
  if (format['timeStyle'] !== undefined && !['short', 'medium', 'long'].includes(String(format['timeStyle']))) return false;
  if (kind === 'decimal' && format['unit'] !== undefined && format['unit'] !== 'preserve' && format['unit'] !== 'hidden') return false;
  return true;
}

function normalizeStringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const result: string[] = [];
  for (const entry of value) {
    const normalized = nonEmptyString(entry);
    if (normalized === null) return null;
    if (!result.includes(normalized)) result.push(normalized);
  }
  return result;
}

function parseFieldPath(value: unknown): string[] | null {
  if (typeof value === 'string') {
    const parts = value.split('.').map((part) => part.trim());
    return parts.length > 0 && parts.every(isSafePathSegment) ? parts : null;
  }
  if (!Array.isArray(value) || value.length === 0) return null;
  const parts = value.map((part) => nonEmptyString(part));
  return parts.every((part): part is string => part !== null && isSafePathSegment(part)) ? parts : null;
}

function isSafePathSegment(value: string): boolean {
  return value.length > 0 &&
    value !== '__proto__' &&
    value !== 'prototype' &&
    value !== 'constructor' &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function isJsonValue(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value === null || typeof value !== 'number' || Number.isFinite(value);
  }
  if (Array.isArray(value)) return value.every((entry) => isJsonValue(entry));
  if (typeof value !== 'object') return false;
  return Object.values(value as JsonRecord).every((entry) => isJsonValue(entry));
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((entry, index) => deepEqual(entry, right[index]));
  }
  if (typeof left === 'object' && typeof right === 'object') {
    const leftRecord = left as JsonRecord;
    const rightRecord = right as JsonRecord;
    const leftKeys = Object.keys(leftRecord);
    const rightKeys = Object.keys(rightRecord);
    return leftKeys.length === rightKeys.length && leftKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(rightRecord, key) && deepEqual(leftRecord[key], rightRecord[key]),
    );
  }
  return false;
}

function rejected(
  protocol: string,
  code: string,
  message: string,
  details: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return { protocol, status: 'rejected', outcome: 'rejected', error: { code, message }, ...details };
}

function revisionValue(value: unknown): number | null {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+$/u.test(value.trim()) ? Number(value) : null;
  return numeric !== null && Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : null;
}

function incrementRevision(raw: unknown, next: number): number | string {
  return typeof raw === 'string' ? String(next) : next;
}

function findBeforeValue(
  record: JsonRecord,
  occurrenceId: string | null,
  fieldPath: readonly string[] | null,
): Readonly<{ present: boolean; value: unknown }> {
  if (Object.prototype.hasOwnProperty.call(record, 'beforeValue')) return { present: true, value: record['beforeValue'] };
  const rows = Array.isArray(record['rows']) ? record['rows'] : [];
  if (occurrenceId === null || fieldPath === null) return { present: false, value: null };
  const row = rows.map((entry) => asRecord(entry)).find((entry) => entry !== null && entry['occurrenceId'] === occurrenceId);
  const values = row === null || row === undefined ? null : asRecord(row['values']);
  if (values === null) return { present: false, value: null };
  let cursor: unknown = values;
  for (const segment of fieldPath) {
    const current = asRecord(cursor);
    if (current === null || !Object.prototype.hasOwnProperty.call(current, segment)) return { present: false, value: null };
    cursor = current[segment];
  }
  return { present: true, value: cursor };
}

function buildViewOutput(record: JsonRecord): Readonly<Record<string, unknown>> {
  const baseRevision = revisionValue(record['baseViewRevision']);
  const columnId = nonEmptyString(record['columnId']);
  const width = finiteNumber(record['width']);
  const order = nonNegativeInteger(record['order']);
  const visible = record['visible'] === undefined ? true : booleanValue(record['visible']);
  const frozen = record['frozen'] === undefined ? false : frozenValue(record['frozen']);
  const errors: string[] = [];
  if (baseRevision === null) errors.push('baseViewRevision 必须是非负整数或数字字符串');
  if (columnId === null) errors.push('columnId 必须是非空字符串');
  if (width === null || width < 40 || width > 2_000) errors.push('width 必须是 40 到 2000 之间的数字');
  if (order === null) errors.push('order 必须是非负整数');
  if (visible === null) errors.push('visible 必须是布尔值');
  if (frozen === null) errors.push('frozen 必须是 false、start 或 end');
  if (errors.length > 0) return rejected('bom-editor-view-change/v1', 'INVALID_VIEW_CHANGE', errors.join('；'), { viewRevision: null, changed: null });
  const nextRevision = incrementRevision(record['baseViewRevision'], baseRevision! + 1);
  return {
    protocol: 'bom-editor-view-change/v1',
    outcome: 'accepted',
    baseViewRevision: incrementRevision(record['baseViewRevision'], baseRevision!),
    viewRevision: nextRevision,
    changed: { columnId, width, order, visible, frozen },
    documentRevision: record['documentRevision'] ?? null,
    documentChanged: record['documentChanged'] === true,
  };
}

type SearchRow = Readonly<{ occurrenceId: string; materialCode?: string; values: JsonRecord }>;

function normalizeSearchRows(value: unknown): SearchRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: SearchRow[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    const row = asRecord(candidate);
    const occurrenceId = row === null ? null : nonEmptyString(row['occurrenceId']);
    const values = row === null ? null : asRecord(row['values']);
    const materialCode = row === null || row['materialCode'] === undefined ? undefined : nonEmptyString(row['materialCode']);
    if (occurrenceId === null || values === null || ids.has(occurrenceId) || (row !== null && row['materialCode'] !== undefined && materialCode === null)) return null;
    ids.add(occurrenceId);
    if (materialCode === undefined) rows.push({ occurrenceId, values });
    else rows.push({ occurrenceId, materialCode: materialCode!, values });
  }
  return rows;
}

function searchMode(value: unknown): 'exact' | 'prefix' | 'fuzzy' | 'regex' | null {
  const mode = value === undefined ? 'prefix' : value;
  return mode === 'exact' || mode === 'prefix' || mode === 'fuzzy' || mode === 'regex' ? mode : null;
}

function isSafeSearchRegex(pattern: string): boolean {
  return !/(?:\(\?[=!<]|\\(?:[1-9]|k<))/u.test(pattern);
}

function valueTexts(value: unknown): string[] {
  if (value === null) return [''];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap((entry) => valueTexts(entry));
  if (typeof value === 'object') return Object.values(value as JsonRecord).flatMap((entry) => valueTexts(entry));
  return [];
}

function searchScoreFor(
  rawValue: string,
  rawQuery: string,
  mode: 'exact' | 'prefix' | 'fuzzy' | 'regex',
  caseSensitive: boolean,
  matchWholeCell: boolean,
  regex: RegExp | null,
): number | null {
  const value = rawValue.trim().normalize('NFKC');
  const query = rawQuery.normalize('NFKC');
  if (mode === 'regex') {
    if (regex === null) return null;
    regex.lastIndex = 0;
    const match = regex.exec(value);
    if (match === null || (matchWholeCell && (match.index !== 0 || match[0].length !== value.length))) return null;
    return 1;
  }
  const candidate = caseSensitive ? value : value.toLocaleLowerCase();
  const normalizedQuery = caseSensitive ? query : query.toLocaleLowerCase();
  if (matchWholeCell || mode === 'exact') return candidate === normalizedQuery ? 10_000 : null;
  if (mode === 'prefix') return candidate.startsWith(normalizedQuery) ? 5_000 - candidate.length : null;
  let cursor = 0;
  let gaps = 0;
  for (const character of normalizedQuery) {
    const next = candidate.indexOf(character, cursor);
    if (next < 0) return null;
    gaps += next - cursor;
    cursor = next + character.length;
  }
  return 1_000 - gaps - Math.max(0, candidate.length - normalizedQuery.length) * 0.1;
}

function buildClipboardOutput(record: JsonRecord): Readonly<Record<string, unknown>> {
  const representation = record['representation'] === undefined ? 'text/plain' : record['representation'];
  const allowedRepresentations = new Set(['text/plain', 'text/html', 'application/x-bom-editor-clipboard+json', 'internal', 'html', 'text']);
  const rows = record['rows'];
  const representations = resolveDemoClipboardRepresentations(record);
  const targetInput = record['target'];
  const target = asRecord(targetInput);
  const policyInput = record['policy'];
  const policy = asRecord(record['policy']) ?? {};
  const maxCellsRaw = record['maxCells'] ?? policy['maxCells'] ?? 10_000;
  const maxCells = positiveInteger(maxCellsRaw);
  const formulaProtection = policy['formulaProtection'] === undefined ? 'safe' : policy['formulaProtection'];
  const candidateFormats = representations.ok
    ? representations.formats
    : Object.freeze([] as ('internal' | 'html' | 'text')[]);
  const errors: string[] = [];
  if (typeof representation !== 'string' || !allowedRepresentations.has(representation)) errors.push('representation 不是支持的剪贴板格式');
  if (!representations.ok) errors.push(...representations.errors);
  if (policyInput !== undefined && asRecord(policyInput) === null) errors.push('policy 必须是对象');
  if (target === null || nonNegativeInteger(target['rowIndex']) === null || nonNegativeInteger(target['columnIndex']) === null) errors.push('target 必须包含非负整数 rowIndex 和 columnIndex');
  if (maxCells === null) errors.push('maxCells 必须是正整数');
  if (formulaProtection !== 'safe' && formulaProtection !== 'allow') errors.push('policy.formulaProtection 只能是 safe 或 allow');
  const normalizedRows = Array.isArray(rows) && rows.every((row) => Array.isArray(row))
    ? rows as unknown[][]
    : [];
  const rowCount = normalizedRows.length;
  const columnCount = normalizedRows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  const targetCellCount = normalizedRows.reduce((count, row) => count + row.length, 0);
  const formulaCount = normalizedRows.reduce((count, row) => count + row.filter((cell) => typeof cell === 'string' && cell.trimStart().startsWith('=')).length, 0);
  const protectedFormulaCount = formulaProtection === 'safe' ? formulaCount : 0;
  if (maxCells !== null && targetCellCount > maxCells) errors.push(`单元格数量 ${targetCellCount} 超过 maxCells ${maxCells}`);
  if (errors.length > 0) {
    return rejected('bom-editor-paste-operation/v1', 'INVALID_PASTE_INPUT', errors.join('；'), {
      representation: typeof representation === 'string' ? representation : null,
      target: targetInput ?? null,
      rowCount,
      columnCount,
      targetCellCount,
      formulaCount,
      protectedFormulaCount,
      candidateFormats,
      policy: { formulaProtection, maxCells },
      transactionId: null,
    });
  }
  return {
    protocol: 'bom-editor-paste-operation/v1',
    status: 'ready',
    outcome: 'ready',
    representation: representation as string,
    candidateFormats,
    target,
    rowCount,
    columnCount,
    targetCellCount,
    formulaCount,
    protectedFormulaCount,
    policy: { formulaProtection, maxCells: maxCells! },
    transactionId: null,
  };
}

function setExampleStatus(view: HTMLElement, text: string, state: 'ready' | 'error'): void {
  const status = view.querySelector<HTMLElement>('[data-example-status]');
  if (status === null) return;
  status.textContent = text;
  status.dataset['state'] = state;
}
