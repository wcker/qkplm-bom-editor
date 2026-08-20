# ADR-0009：以稳定 Core 子路径隐藏物理包边界

- 状态：已替代（由 [ADR-0011](./0011-qkplm-public-package-distribution-and-i18n.md) 替代公开 npm 名称与分发策略；稳定子路径边界仍适用）
- 日期：2026-07-18
- 规范依据：[v2 白皮书](../../现代化高性能可复用BOM编辑器组件.md)，重点参见第 2.2、8.6、14.3、16、17 章

## 上下文

白皮书把 `@bom-editor/core` 及其声明子路径定义为应用、框架适配器和 Demo 的公开消费面，同时要求 contracts、model、transaction、datasource、browser runtime 与 Canvas renderer 保持单向依赖和不同运行时边界。

仓库为降低构建耦合、独立验证算法和避免 runtime 与 renderer 循环依赖，当前把这些能力实现为多个 `@bom-editor/*` 物理包，并另设 `@bom-editor/editor` 完成 F3 纵向组合。若应用直接依赖物理包名，后续合包、拆包或移动实现就会成为破坏性变更；若在 Core 内复制实现或协议类型，又会形成两套真相来源和行为漂移。

同时，Core 根入口不能简单聚合全部底层符号。这样会扩大首屏导出图、增加名称冲突，并让 headless 调用方难以判断 DOM 边界。根入口仍需提供 F3 的 `createBomEditor` 主链，并保证在 SSR/Node 的模块求值阶段不读取浏览器全局。

## 决策

1. `@bom-editor/core` 是唯一稳定的 Core 包名。应用、Demo、Vue/React/UMD 适配器和第三方插件只能使用其根入口或已声明子路径；当前 `@bom-editor/contracts`、`@bom-editor/model`、`@bom-editor/transaction`、`@bom-editor/datasource`、`@bom-editor/runtime`、`@bom-editor/renderer-canvas` 与 `@bom-editor/editor` 属于实现边界，不获得面向应用的独立兼容承诺。
2. 建立以下透明映射：`core/contracts` -> contracts、`core/model` -> model、`core/transaction` -> transaction、`core/datasource` -> datasource、`core/runtime` -> runtime、`core/renderer/canvas` -> renderer-canvas。facade 不增加包装、默认值或第二套类型；contracts 必须使用 `export type *` 保持零运行时值。
3. Core 根入口只聚合 `@bom-editor/editor` 的公共出口与中立 contracts 类型。它提供 `createBomEditor` 和实例生命周期主 API，但不把 model、transaction、datasource、runtime 或 renderer 的全部符号扁平化；需要底层能力的调用方必须显式选择对应稳定子路径。
4. `@bom-editor/editor` 只作为组成层接入根入口，不暴露其文件级 internal，也不得让 Core facade 反向成为 editor 的依赖。组成层与各物理包必须先独立构建成功，Core 再针对其已生成声明构建发布产物。
5. browser 子路径可以包含 DOM 类型，但所有 Core 入口在模块求值阶段都禁止读取 `window`、`document`、Canvas 或 Worker 全局。DOM、Canvas、监听器和其他资源只能在显式 `mount()` 或 renderer mount 后创建。
6. 兼容性比较以 Core 根入口和稳定子路径的完整 `.d.ts`/运行时 export graph 为准。物理包可以在 ADR 与迁移验证下调整，只要逻辑出口、行为、错误码、事件及序列化协议保持兼容。
7. 发布门禁必须逐入口验证：源码只能是透明重导出、TypeScript 符号集合与来源包精确相等、`package.json exports` 和依赖完整、contracts 无运行时值、运行时导出等价，以及带受保护浏览器全局的 Node/SSR 导入成功。

## 后果

### 正面后果

- 使用者只依赖与白皮书一致的稳定路径，仓库可以继续按算法、运行时和渲染边界独立演进。
- contracts 仍有唯一机器可读来源，不会因为 facade 复制而产生类型身份和序列化语义分叉。
- 根入口直接支持 F3 编辑器主链，headless 与高级调用方仍能通过显式子路径获得清晰的环境边界和更小导出图。
- 物理重构不必自动升级为公开破坏性变更，API 差异审查聚焦真实消费面。

### 代价与约束

- 发布 Core 前必须构建并发布其物理依赖，版本和锁文件需要保持协调。
- 每增加白皮书规定的稳定子路径，都要同步 exports、类型路径、SSR 矩阵、README 和精确重导出门禁。
- 统一 Core 构建包含 DOM lib，不能替代 contracts/model/transaction 各自的无 DOM 类型门禁；不同环境仍需分别验证。
- 工作区内部可以直接依赖物理包来维持单向图，但 Demo、适配器和公开示例不得沿用这些内部导入。

## 被否决方案

### 把所有实现立即搬入一个物理 Core 包

否决原因：会在 F3 阶段放大变更面，削弱现有独立测试和依赖方向，且不能带来额外的用户侧兼容价值。逻辑 facade 已能把物理布局与消费 API 解耦。

### 让应用直接使用各 `@bom-editor/*` 物理包

否决原因：物理布局会固化为长期兼容表面，任何合包、拆包和职责移动都成为破坏性升级，也违背适配器只依赖 Core 公开出口的规范。

### 在 Core 复制类型或增加包装实现

否决原因：会形成第二套协议或默认行为，精确等价无法保证，错误修复也必须在多处同步。

### 根入口重导出所有稳定子路径

否决原因：会模糊 headless/browser 边界、增加符号碰撞和意外公开面积，并使根入口的兼容负担随每个内部工具增长。编辑器主链与底层子系统应保持不同入口。

### browser 子路径仅因包含 DOM 类型就禁止 SSR 导入

否决原因：类型环境与模块求值副作用是不同问题。SSR 可以不调用挂载 API，但仍需要安全加载模块、生成路由或做依赖分析。

## 验证方式

- TypeScript 门禁比较每个稳定子路径与对应物理来源的完整导出符号集合，并比较根入口与 editor + contracts 的精确并集。
- 编译 fixture 对代表性协议、模型、事务、DataSource、runtime、Canvas 和 editor 类型及函数签名做双向等价断言。
- 包门禁锁定 `exports` 的 types/import/default 路径、`sideEffects: false` 和所需 workspace 依赖，拒绝未声明入口。
- Node/SSR 烟测为浏览器全局安装抛错 getter，导入根入口和全部稳定子路径，并比较 facade 与物理包的运行时导出集合。
- contracts、model、transaction 继续在各自包中使用无 DOM TypeScript lib 和边界测试；runtime 与 Canvas 使用 browser lib，并通过生命周期测试验证资源只在挂载后创建且可释放。
