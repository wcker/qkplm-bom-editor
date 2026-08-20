# @qkplm/bom-editor-react

React 18+ 的生命周期桥接包。它不保存业务状态，也不把 React 引入 Core；BOM
文档、列定义和策略仍由宿主通过公开 Props 输入，交互结果通过公开 Outputs 回写。

```bash
pnpm add @qkplm/bom-editor @qkplm/bom-editor-react react
```

## 最小受控接入

下面的 `schema`、`columns` 和 `initialDocument` 都是宿主输入。实际项目可从前端
状态容器传入，但不要直接读取 renderer 内部状态。

```tsx
import { useEffect, useRef, useState } from 'react';
import {
  createBomEditorReactAdapter,
  type BomReactEditorAdapter,
} from '@qkplm/bom-editor-react';
import type {
  BomDocumentSnapshot,
  BomEditorComponentProps,
} from '@qkplm/bom-editor';

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
} as const;

const columns = [
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
] as const;

const initialDocument: BomDocumentSnapshot = {
  schemaVersion: 'bom-demo/v1',
  documentId: 'react-demo',
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

export function BomEditorPanel() {
  const hostRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<BomReactEditorAdapter | null>(null);
  const [document, setDocument] = useState(initialDocument);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const props: BomEditorComponentProps = {
      schema,
      columns,
      document: initialDocument,
      instanceId: 'react-bom-editor',
      outputs: {
        onDocumentChange: ({ snapshot }) => setDocument(snapshot),
        onError: () => setError('编辑器操作被拒绝，请检查返回的 BomResult。'),
      },
    };
    const adapter = createBomEditorReactAdapter(props);
    adapterRef.current = adapter;
    const host = hostRef.current;
    if (host !== null) {
      void adapter.mount(host).then((result) => {
        if (!result.ok) setError(result.error.code);
      });
    }
    return () => {
      adapter.destroy();
      if (adapterRef.current === adapter) adapterRef.current = null;
    };
  }, []);

  // 受控文档替换：不要重建实例，也不要修改旧 Snapshot。
  useEffect(() => {
    const adapter = adapterRef.current;
    if (adapter === null) return;
    void adapter.update({ document }).then((result) => {
      if (!result.ok) setError(result.error.code);
      else setError(null);
    });
  }, [document]);

  const recover = () => {
    const next: BomDocumentSnapshot = {
      ...document,
      revision: String(Number(document.revision) + 1),
    };
    setDocument(next);
  };

  return (
    <section>
      {error !== null && <p role="alert">{error}</p>}
      <button type="button" onClick={recover}>传入有效 Snapshot 恢复</button>
      <div ref={hostRef} style={{ height: 520 }} />
    </section>
  );
}
```

`mount()`、`ready` 和 `update()` 都返回或结算为 `BomResult`；必须先检查
`ok`，再读取 `value`。React StrictMode 下 effect 可能经历额外的清理和重建，
适配器的 `destroy()` 是幂等的，但已销毁实例不可再次 mount。

## 组件语言

语言选择由 React 宿主控制，不在组件内渲染全局语言按钮。创建或保留同一个 adapter 后调用：

```ts
adapter.component.configurePresentation({ locale: 'en-US' });
```

默认值为 `zh-CN`。此调用仅更新组件自有菜单、编辑提示和 ARIA 文案，不翻译 `columns` 或
Snapshot 中的业务字段，也不替换当前文档或交互状态。

## 生命周期边界

| React 时机 | 调用 | 说明 |
| --- | --- | --- |
| effect 创建 | `createBomEditorReactAdapter(props)` | 仅创建 headless 组件。 |
| DOM ref 可用 | `adapter.mount(host)` | 挂载 Canvas、语义 DOM 和 Portal。 |
| 受控 Props 改变 | `adapter.update({ document })` | 输入下一份完整、合法 Snapshot。 |
| effect cleanup | `adapter.destroy()` | 取消任务并释放该实例资源。 |

可运行的浏览器接入实验室在 Demo 的“原生、React 与 Vue 接入”示例中；它只调用
`@qkplm/bom-editor`、`@qkplm/bom-editor-react`、`@qkplm/bom-editor-vue` 和 `@qkplm/bom-editor-umd`
的公开出口，并展示拒绝、恢复、卸载重挂和销毁重建的结果。
