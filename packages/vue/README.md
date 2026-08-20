# @qkplm/bom-editor-vue

Vue 3 的生命周期桥接包。它不创建 Vue watcher，也不保存 BOM 业务数据；宿主负责
通过公开 Props 输入 Schema、Snapshot 和列定义，并通过公开 Outputs 回写状态。

```bash
pnpm add @qkplm/bom-editor @qkplm/bom-editor-vue vue
```

## 最小受控接入

下面的示例假定 `schema`、`columns` 与 `initialDocument` 是已验证的前端输入。它们的
完整结构与 `@qkplm/bom-editor` 的 `BomEditorComponentProps` 一致。

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  createBomEditorVueAdapter,
  type BomVueEditorAdapter,
} from '@qkplm/bom-editor-vue';
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

const document = ref<BomDocumentSnapshot>({
  schemaVersion: 'bom-demo/v1',
  documentId: 'vue-demo',
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
});

const host = ref<HTMLDivElement | null>(null);
const error = ref<string | null>(null);
let adapter: BomVueEditorAdapter | null = null;

function outputs(): NonNullable<BomEditorComponentProps['outputs']> {
  return {
    onDocumentChange: ({ snapshot }) => {
      document.value = snapshot;
    },
    onError: () => {
      error.value = '编辑器操作被拒绝，请检查返回的 BomResult。';
    },
  };
}

onMounted(async () => {
  const props: BomEditorComponentProps = {
    schema,
    columns,
    document: document.value,
    instanceId: 'vue-bom-editor',
    outputs: outputs(),
  };
  adapter = createBomEditorVueAdapter(props);
  if (host.value === null) return;
  const mounted = await adapter.mount(host.value);
  if (!mounted.ok) error.value = mounted.error.code;
});

// 将宿主状态回传给同一个组件实例，而非原地修改旧 Snapshot。
watch(document, async (nextDocument) => {
  if (adapter === null) return;
  const result = await adapter.update({ document: nextDocument });
  if (!result.ok) error.value = result.error.code;
  else error.value = null;
}, { deep: false });

function recover(): void {
  document.value = {
    ...document.value,
    revision: String(Number(document.value.revision) + 1),
  };
}

onBeforeUnmount(() => {
  adapter?.destroy();
  adapter = null;
});
</script>

<template>
  <section>
    <p v-if="error" role="alert">{{ error }}</p>
    <button type="button" @click="recover">传入有效 Snapshot 恢复</button>
    <div ref="host" style="height: 520px" />
  </section>
</template>
```

`mount()`、`ready` 和 `update()` 都会返回或结算 `BomResult`。调用方必须先检查
`ok`，不要在失败分支读取 `value`。当 `update()` 拒绝无效 Snapshot 时，组件仍保留
上一份有效文档；传入下一份完整、合法 Snapshot 即可恢复，无需静默重建。

## 组件语言

语言选择由 Vue 宿主控制，不在组件内渲染全局语言按钮。创建或保留同一个 adapter 后调用：

```ts
adapter.component.configurePresentation({ locale: 'en-US' });
```

默认值为 `zh-CN`。此调用只更新组件自有菜单、编辑提示和 ARIA 文案；`columns` 和 Snapshot
内的业务字段保持不变，也不会替换当前文档或交互状态。

## 生命周期边界

| Vue 时机 | 调用 | 说明 |
| --- | --- | --- |
| `onMounted` | `createBomEditorVueAdapter(props)`、`mount(host)` | 创建并挂载实例。 |
| `watch(document)` | `update({ document })` | 受控替换合法 Snapshot。 |
| `onBeforeUnmount` | `destroy()` | 释放该实例的 DOM、事件和任务资源。 |

Demo 的“原生、React 与 Vue 接入”场景可直接切换 `vue` 适配器，实际运行公开
`mount`、错误返回、恢复、`unmount`/重挂与销毁重建流程。
