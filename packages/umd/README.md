# @qkplm/bom-editor-umd

原生 HTML 或传统全局脚本宿主的桥接包。UMD 文件加载后直接提供
`window.QkplmBomEditor` 命名空间，并继续使用与 ESM 相同的
`createBomEditor` / `createBomEditorComponent` 公开 API。

```bash
pnpm add @qkplm/bom-editor @qkplm/bom-editor-umd
```

## 原生 HTML / 脚本宿主

生产环境应固定版本并从同一版本的 `integrity.json` 读取 SHA-384 值。严格 CSP 部署应将
初始化代码放入独立的同源脚本文件，不要复制下面的示例内联脚本。`props` 是完整的公开输入，
至少包含 `schema`、`document`、`columns` 和可选 `outputs`；不要依赖 Demo 或 renderer 内部对象。

```html
<div id="bom-editor" style="height: 520px"></div>
<output id="bom-status" aria-live="polite"></output>

<script
  src="https://cdn.jsdelivr.net/npm/@qkplm/bom-editor-umd@1.0.0-rc.1/dist/bom-editor.umd.min.js"
  integrity="sha384-xwz9V+jY6YnBTj7apBOVnbjNhruRnWbCaXaqdXTlyOan8cHyVQ39l9o9Zb3sWFe/"
  crossorigin="anonymous"
></script>
<script>

  const status = document.querySelector('#bom-status');
  const host = document.querySelector('#bom-editor');

  const schema = {
    schemaVersion: 'bom-demo/v1',
    fields: [
      {
        fieldId: 'materialCode',
        path: ['materialCode'],
        type: { kind: 'string', maxLength: 64 },
        required: true,
        nullable: false,
      },
      {
        fieldId: 'quantity',
        path: ['specification', 'quantity'],
        type: { kind: 'integer', min: '0', max: '999999' },
        required: false,
        nullable: false,
      },
    ],
    allowAdditionalFields: false,
    recommendedDepth: 3,
    maximumDepth: 6,
    canonicalizationVersion: 'bom-canonical-v1',
    contentHashAlgorithm: 'SHA-256',
  };

  let snapshot = {
    schemaVersion: 'bom-demo/v1',
    documentId: 'native-demo',
    revision: '1',
    positionKeyCodecVersion: 'lexicographic-ascii-v1',
    completeness: 'complete',
    knownRootCount: 1,
    roots: ['pump-1'],
    nodes: [{
      occurrenceId: 'pump-1',
      kind: 'material',
      materialId: 'material-pump-1',
      materialCode: 'PUMP-001',
      parentId: null,
      positionKey: 'A0000',
      fields: {
        materialCode: 'PUMP-001',
        specification: { quantity: 12 },
      },
    }],
  };

  const component = window.QkplmBomEditor.createBomEditorComponent({
    schema,
    document: snapshot,
    columns: [
      {
        columnId: 'materialCode',
        fieldName: 'materialCode',
        fieldPath: ['materialCode'],
        label: '物料编码',
        width: 160,
        editable: true,
      },
      {
        columnId: 'quantity',
        fieldName: 'quantity',
        fieldPath: ['specification', 'quantity'],
        label: '数量',
        width: 100,
        editable: true,
        alignment: 'end',
        format: { kind: 'integer', useGrouping: true },
      },
    ],
    outputs: {
      onDocumentChange: ({ snapshot: nextSnapshot }) => {
        snapshot = nextSnapshot;
        status.textContent = `已提交 revision ${snapshot.revision}`;
      },
      onError: () => {
        status.textContent = '操作被拒绝，请检查 BomResult。';
      },
    },
  });

  const mounted = await component.mount(host);
  if (!mounted.ok) {
    status.textContent = mounted.error.code;
  }

  // 失败不会污染当前有效文档；先检查结果，再传入新的完整 Snapshot 恢复。
  const invalid = await component.update({
    document: { ...snapshot, revision: '' },
  });
  if (!invalid.ok) status.textContent = invalid.error.code;
  const recovered = await component.update({
    document: { ...snapshot, revision: String(Number(snapshot.revision) + 1) },
  });
  if (!recovered.ok) status.textContent = recovered.error.code;

  window.addEventListener('pagehide', () => component.destroy(), { once: true });
</script>
```

UMD global 含有 `protocol`、`version`、`createBomEditor` 和
`createBomEditorComponent`。`installBomEditorUmd()` 仍可用于 ESM 或自定义对象；对同一
协议的重复安装是幂等的，如果目标属性被不兼容的值占用，它会抛出
`BOM_EDITOR_UMD_GLOBAL_CONFLICT`，而不是覆盖宿主全局。组件的异步操作仍通过 `BomResult`
失败关闭，已销毁实例不可重新挂载。

Demo 的“原生、React 与 Vue 接入”场景可切换 `umd`，并在隔离目标对象上真实执行显式
安装、挂载、失败恢复、卸载重挂和销毁重建。
