# AIBOMEditor

现代化高性能 BOM 编辑器 SDK 的研发工作区。

## 唯一规范源

[现代化高性能可复用 BOM 编辑器组件 · 生产级技术白皮书 v2.0](./现代化高性能可复用BOM编辑器组件.md) 是架构、实现和验收的唯一规范源。

[旧版官方落地白皮书](./现代化高性能可定制智能BOM编辑器组件%20官方落地白皮书（生产级）.md) 已废弃，只保留为历史产品愿景素材，不得作为研发或验收依据。

## Demo 与帮助

启动固定端口 Demo 后，可从以下入口查看组件能力：

- 工作台：`http://127.0.0.1:4173/`，进行真实鼠标、键盘、滚动和编辑操作。
- 示例中心：`http://127.0.0.1:4173/examples.html`，每个示例包含说明、输入数据、输出数据和代码使用页签。
- 接入实验室：示例中心的“原生、React 与 Vue 接入”场景，可切换 Core、React、Vue 或 UMD 的公开出口，观察错误返回、恢复与销毁重建。
- 在线帮助：`http://127.0.0.1:4173/help.html`，按主题搜索编辑、选区、行列、查找、剪贴板、Props/Outputs 和故障排查。
- [用户使用指南](./docs/用户使用指南.md)，适合在仓库内查阅和链接到具体操作。

v1.0 的目标角色、能力边界和证据化产品声明以[唯一规范源](./现代化高性能可复用BOM编辑器组件.md)第 `0.5` 节为准；React、Vue 与原生脚本接入分别见对应发布包的 README。
已有 `4173` Demo 服务时，可运行 `pnpm --filter @bom-editor/demo test:onboarding:browser` 对当前机器 Chrome 执行四个公开 SDK 入口的浏览器 smoke；该命令不会启动额外 Demo 服务。

初始化视图使用 `BomEditorCommonOptions.initialView` 统一传入列顺序/宽度/冻结/显隐、默认行高、按稳定 `occurrenceId` 的 `rowHeights` 覆盖、展开状态、排序/筛选、稳定 ID 选区和滚动偏移。顶层 `columns` 保留字段路径、编辑性、格式和宽度约束等静态契约；可将 `viewChanged.view.columns` 与 `viewChanged.view.rowHeights` 原样保存并作为下次的 `initialView.columns`/`initialView.rowHeights` 传回。行号右键菜单支持设置、自动调整和恢复默认行高；列头右键菜单支持恢复默认列宽。行高与列宽均为视图交互历史，不改变 Snapshot/revision。挂载容器的视口宽高仍由 renderer 测量，旧的 `rowHeight`、`expandedIds`、`expandAll` 仍可作为兼容字段使用，但同名 `initialView` 成员优先。

## 当前阶段

当前处于 **F4 100K 性能内核并行研发阶段**；F3 首个纵向切片仍处于验收补证状态，尚未通过 F3 阶段退出门禁。

下方较长的 F5 剪贴板段落保留为阶段快照；其中标注的“待实现”以本节后续增量和白皮书最新状态为准。
主线判定（2026-08-06）：用户已授权依 [ADR-0010](./docs/adr/0010-parallel-f4-performance-kernel-development.md)
并行进入 F4，先建设 100K fixture、投影/索引、渲染、调度和 Worker 性能内核及其基准。F3
仍是发布阻断项：认证性能、正式 Realm/内存、人工 WCAG/读屏和 2 小时 soak 证据未闭合，
不得将 smoke、F4 基准或任何实现增量解释为 F3/F4 阶段通过。F5–F7 的非阻断扩展继续冻结。

F2 自动复合门禁已于 2026-08-05 闭合：远程协调器固定 30 seed 状态机、DataSource 共
35 项测试、property gate 6 项和 visibleProjection/双向位置索引 6 seed 组合对照均通过；
`pnpm run f2:coverage` 固化验证 Diff 分支 `96.03%`、基础 indexes `100%`、transaction
engine `95.44%`。F3 仍未准出，不能据此启动 F4 的 100K 性能承诺。

F4 初始 headless 基线已归档于 `benchmarks/reports/f4/f4-deep-freeze-cache/headless-baseline.json`。
`BOM-100K-D6` 全展开 30 列创建为 `7194.27ms`、heap delta `598.45MiB`；
`BOM-100K-FLAT` 为 `5713.01ms`、`604.67MiB`。本轮将 `maxValueNodes` 提升至 `5,000,000`
以接受固定 100K x 30 字段输入，并消除已验证值的重复深冻结；这些是研发基线，不是 F4 SLO
通过结论。后续优化目标是避免完整 Snapshot 的重复规范化和复制。

F4 headless 基线现已覆盖 `collapsed`、确定性 `partial` 与 `all` 三种展开状态，并将 cold
创建与空实例 `setDocument` 分开归档；最新记录为
`benchmarks/reports/f4/f4-cold-and-ready-instance/headless-baseline.json`。该记录中 D6 部分展开
可见 66,050 行，全部展开可见 100,000 行；cold 与 ready-instance 仍处于秒级，仅作为优化诊断，
不构成 F4 SLO 通过。

Worker Runtime 首个可复用切片已落地为 `@bom-editor/worker`，并由
`@qkplm/bom-editor/worker` 稳定出口透传。共享池支持版本化握手、实例公平、优先级老化、背压、
任务合并、AbortSignal/主动取消、超时、过期上下文丢弃、可重放任务、崩溃重建和主线程降级；
Worker 端协议处理器支持能力协商、进度、取消和处理器隔离。6 项 Worker 契约测试已通过，
Node/SSR 导入不访问浏览器全局。该切片目前仍是独立运行时能力，编辑器搜索、校验、导入等长任务
尚未全部接入，100K 队列/传输/内存正式门禁也尚未完成。

`f4-phase-profile` 在独立 fixture 上额外记录 Schema/Snapshot 归一化、索引和投影阶段；当前
Snapshot 归一化仍处于秒级，且显著高于索引和投影，是首要瓶颈。阶段数据用于定位，不得与 cold
端到端样本混用或用于 SLO 结论。

2026-08-05 剪贴板增量：已加入受限纯文本解析 Worker 和 `BomPasteInput.textStream`
有界流式适配。Worker 任务携带 `documentId`/`documentGeneration`，支持取消、销毁终止、
迟到结果丢弃，故障自动回退主线程；流 chunk 在资源限额后才进入统一 TSV/CSV 解析，
chunk 边界不改变语法，取消会尝试关闭来源迭代器。粘贴准备会收集同一请求的全部类型
转换/目标诊断并保持全量拒绝。`textStream` 的 TSV/CSV 路径已改为增量 staging，正常结构化输入不再先拼接完整字符串；解析失败还会返回值无关的首个 `sourceRow`/`sourceColumn` 诊断并沿 `paste()`/`previewPaste()` 透传。最终 rows、转换单元格和命令批次仍受限额约束，完整 spill/流式事务路径和跨格式全量诊断仍未实现。

已实现并有自动测试覆盖的主体包括不可变模型、规范哈希、事务与 Undo/Redo、内存 DataSource、AVL rope 可见投影、browser runtime、三层 Canvas、DOM Portal、IME、虚拟 treegrid、编辑器组成层，以及稳定 `@qkplm/bom-editor` 根入口/子路径。`editor.ready` 现只在首个 Canvas 绘制与语义 DOM 同步完成后结算；未提交首帧的 `mount()` 会被后续 `unmount()`/`destroy()` 正确作废，不会在清理后重新挂载。可写 DataSource 还覆盖 FIFO 乐观持久化、原子 history-suffix 恢复、延迟 own-echo 去重、pending Undo 取消/补偿、RecoveryBundle 重载入口和 `replaceSource({ pending: 'abortAndRollback' })` 的受控回滚。

事务构造也已补齐嵌套语义：`builder.transaction()` 或同步 builder 内的再次 `editor.transaction()` 会按词法顺序合并为一个可 Undo 的原子提交；空/异步 builder、内层选项冲突和构造异常会产生稳定 `transactionRejected`，不会留下部分 revision 或历史。

DataSource 增量还包括只读 `queryDataSource()` 和部分树的 `loadDataSourceChildren()`：两者均绑定当前 source revision、document ID 与 generation；查询不修改本地视图，分页子节点先在 staging 中验证后才通过单次 `documentReplaced(reason: 'loadChildren')` 发布。来源切换、恢复、销毁或 revision 漂移会取消或丢弃迟到请求，避免半页或旧代际数据写入当前文档。

F5 稳定 ID 矩形范围选区切片已落地：支持单矩形范围与稳定端点、Shift 键盘/单击或鼠标拖拽扩展，以及折叠和文档变化后的选区收敛；`Ctrl/Command+A` 选择当前可见投影的完整矩形。行号/列头点击、`Shift+Space` 和 `Ctrl/Command+Space` 还可产生带 `mode: 'row' | 'column'` 的整行/整列稳定选区，Shift+头部点击可扩展同轴连续范围；Ctrl/Command+单击可追加或移除稳定矩形，`selectionChanged` 输出可选的 `ranges` 完整集合。多范围会随可见投影变化裁剪；普通复制仍保持 fail-closed，删除、粘贴和填充的受限原子支持以本段后的增量说明为准。活动可编辑单元格在非 IME、非修饰键输入下接收可打印字符时，会以该字符替换原值并进入编辑。已交付受限的 `text/plain` 剪贴板能力：copy 在读取或序列化字段前同步执行 Clipboard Policy，支持字段裁剪和预定义脱敏，并防护公式注入；优先使用 Async Clipboard，在不可用时回退到原生 `copy` 事件，审计事件不包含原始字段值。安全单元格 cut 仅作用于当前可见矩形中可编辑、Schema 非必填、无 `defaultValue` 且实际存在的字段；Policy 必须完整原样允许全部选中字段，任意字段裁剪或 `omit`/`redact`/`hash` 脱敏都会拒绝 cut。键盘 cut 固定使用受信任的原生 `cut` 事件，避免 Async Clipboard 权限拒绝后无法可靠回退；该事件成功写入后，才会以单一 `editor:cut` `unsetField` 事务清除字段，Undo 可恢复。提交前复核文档 ID、documentGeneration、revision 和挂载代际，过期结果不删除，审计始终不含原值。独立分支剪切现已实现：活动行或整行选区作为根，默认包含所有已加载后代且不受折叠影响，要求完整 Snapshot；`Primary+Shift+B`/`Primary+Shift+K` 生成 branch-tree 包并分别走 `copy-branch`/`cut-branch` Policy，写入成功后以一个 `editor:cut-branch` `deleteSubtree` 批事务提交，Undo 可恢复，branch-tree 粘贴显式失败关闭。paste 通过原生 `paste` 事件、公开 `paste()` 或 `pasteText()` 进入同一管线；Canvas 受限采集 internal、HTML、纯文本候选表示，并按 `internal -> html -> text` 选择。当前已支持严格的 V1 入站 internal 矩形文本 envelope（仅固定格式、版本、种类和矩形 `string[][]`，不含文档、稳定 ID、字段路径、命令、Policy 或样式）；无效 internal 可安全降级到同时提供的纯文本。HTML 解析器只读取受限表格文本，丢弃 script/style/embed/iframe 等活动内容，解码有限实体并将 `rowspan`/`colspan` 展开为有界矩形；无表格、畸形标记或资源超限时安全失败。纯文本严格解析带引号/换行的 TSV/CSV，修复单列多行与单单元格转义往返，并以默认 1 MiB、10,000 行、256 列、10,000 单元格、64 KiB/单元格限额约束输入；三种已支持解析均采用协作式增量分片并响应 `AbortSignal`，取消时不会进入 Policy 或事务。调用 `paste()` 或 `pasteText()` 时即占用实例 FIFO 变更队列槽位，解析、目标构建、预检/转换和本地提交均在同一队列任务内执行，随后调用的 `execute()`、粘贴或 `setDocument()` 不得超车。解析完成后、目标预检/Schema 转换期间及提交前复核文档 ID、generation、revision 和选区目标代际，文档或目标变化均失败关闭；目标行映射每 256 行协作让步并复核取消与目标代际，预检和转换仍每 512 个单元格让出一次。`destroy()` 会中止尚未本地提交的运行中粘贴；`AbortSignal` 在本地提交前（包括同步 `beforeTransaction` 派发期间）触发时阻止本地事务，Snapshot 保持不变。经列 `editable` 检查和独立 `pastePolicy` 授权后，矩形选区必须与输入精确同尺寸，活动单元格则向可见连续行列扩展；成功时以单个可 Undo 的原子事务提交。`pasteOperation` 与迟到的 copy/cut 审计均保留原始文档代际，且不包含原文或转换值；Policy 审计 token 受限为短 ASCII 标识。Worker 解析、流式来源、完整大数据粘贴和完整单元格级错误报告仍未实现；当前仍不代表完整剪贴板契约或 F5 阶段准出。

上一段长剪贴板描述是 2026-08-04 的历史快照；其待实现措辞不覆盖后续状态。当前清单已收敛：内部格式外发、多 MIME Clipboard 写入、独立树/分支剪切和受限 V1 分支粘贴现已交付；受限 Worker/流式解析和首个解析源位置诊断也已交付，仍待实现的是完整大数据 spill/流式事务路径和跨格式全量单元格错误报告。多范围删除/退格、同列批量赋值、`Ctrl/Command+D` 向下填充、`fillSeries()` 和 DOM Portal 同列多范围 `Ctrl/Command+Enter` 已在后续增量中交付；复制仍对多范围 fail-closed，多范围鼠标填充柄仅扩展活动范围但会保留合格同伴，并复用单个原子填充事务；多范围粘贴已在 2026-08-11 增量中交付。

当前剪贴板增量已补齐 `previewPaste()`、`taskProgress`、独立 `cut-branch` 和 V1 `branch-tree` 粘贴：预览复用解析、目标映射、Schema 转换和 `pastePolicy`，只返回冻结的规范化目标单元格，不产生事务；粘贴和预览都按 FIFO 任务发出单调的阶段进度。单一候选解析拒绝透传值无关的首个源行/列诊断；当 internal、HTML、纯文本候选均失败时，会有界汇总全部候选的诊断，并通过可选 `candidateFormat` 标记来源格式。分支切片以活动行或整行选区为根，默认包含所有已加载后代（不受折叠影响），要求完整 Snapshot；`Primary+Shift+B`/`Primary+Shift+K` 分别触发分支复制/剪切，分支使用独立 Policy operation、branch-tree 内部包和审计，可信 Async Clipboard 写入成功后才提交一个 `editor:cut-branch` `deleteSubtree` 批事务，Undo 可恢复。分支粘贴会重新校验节点和 Schema、重映射 ID，并通过单一 `editor:paste-branch` `insertNode` 批事务提交；HTML/文本大纲不会作为树数据导入。剩余剪贴板缺口是完整大数据 spill/流式事务路径和每个候选继续扫描的完整单元格错误报告；受限 Worker/流式解析已覆盖。

编辑能力的后续校正：多范围 `Delete`/`Backspace`、同列批量赋值、`Ctrl/Command+D` 向下填充和 `fillSeries()` 已按稳定地址聚合为单一原子事务；普通多范围复制仍 fail-closed，多范围粘贴支持将同一份同尺寸输入矩形原子地应用到多个不连续选区，重叠目标、只读、Policy、Schema、代际或目标单元格限额失败时整批拒绝。鼠标填充柄可扩展活动范围并保留满足条件的多范围同伴。README 前文的历史快照措辞不覆盖该校正。

2026-08-12 填充柄增量：当多范围中的每个范围至少两行时，右下角填充柄会保留其他范围、仅扩展活动范围，并把全部范围交给同一 `editor:fill-down` 原子事务处理。按住 `Alt` 开始拖拽时，活动范围至少提供前两行，其他静态同伴至少提供前三行，即可把所有范围交给同一 `fillSeries()` 原子事务；活动范围扩展后按首两行数值或 ISO 时间推导序列。含单行同伴、触摸、轴选区、不可见目标、只读/Schema/代际失败或重叠命令冲突不会提交；相对引用、跨范围扩展及完整隐藏/筛选语义仍未开放。

当前补充：V1 `branch-tree` 粘贴已支持节点结构复核、Schema/`pastePolicy` 授权、ID 重映射和单一 `editor:paste-branch` `insertNode` Undo 事务；HTML/文本大纲不会作为树数据导入。普通 `copy` 与安全 `cut` 现在共用默认的 10,000 行、256 列、10,000 单元格、1 MiB 总输出和 64 KiB/单元格上限；超过限制在 Policy 和字段读取前失败关闭。

浏览器编辑器还支持 `editNavigation` 输入属性：省略时 `Enter` 提交后移至同列下一可见行，`Tab`/`Shift+Tab` 按可见行优先正反向移动至下一个可编辑单元格，并跳过 `editable: false` 列。`{ enter: 'none' }` 或 `{ tab: 'none' }` 可分别关闭它们。导航只在提交成功且文档/选区目标未过期时发生；IME 合成、取消、校验或提交失败、边界无目标时均不移动。移动仍使用既有 `selectionChanged` 和 `editEnd` 事件输出。

当 treegrid 自身拥有焦点时，`Ctrl/Command+Z` 调用既有 Undo，`Ctrl/Command+Y` 与 `Ctrl/Command+Shift+Z` 调用 Redo；IME、Alt/AltGraph、自动重复和编辑 Portal 不会被该快捷键路径劫持。快捷键注册表已支持按稳定 `id` 原子覆盖/禁用默认绑定、追加高优先级命令、组合键序列、focused/editing/dragging 作用域、结构化冲突诊断、保留键警告以及 `configureShortcuts()`/`resetShortcuts()` 热更新；未聚焦实例、宿主输入框和 IME 不会被拦截。Undo/Redo 会按稳定行列 ID 恢复提交前后的选区，并通过 renderer 的受限滚动定位尽可能恢复视口偏移。`grid.cut` 改绑无法安全伪造浏览器受信任 cut 事件，仍需保留原生 cut 路径或使用宿主自定义授权命令。

treegrid 未编辑态还支持结构编辑：`Insert` 复制当前节点为同级节点，`Ctrl/Command+Insert` 复制为当前节点的最后一个子级；`Alt+ArrowUp`/`Alt+ArrowDown` 在同级间移动，`Alt+ArrowLeft` 提升层级，`Alt+ArrowRight` 缩进到前一个同级节点下，`Shift+Delete` 删除当前子树。完整 Snapshot 上每项结构操作都基于稳定 `occurrenceId` 生成一个原子、可 Undo 的 `insertNode`、`moveSubtree` 或 `deleteSubtree` 事务，成功后通过既有 `transactionCommitted`、`documentChanged` 和组件 `onDocumentChange` 输出；新增节点复制经过 Schema 规范化的字段和物料引用并生成新 ID。范围/轴选区、IME、重复按键和编辑 Portal 均 fail-closed。部分 Snapshot 的键盘或指针移动不会伪造本地事务，而是通过组件 `onStructureMoveRequest`（或编辑器 `structureMoveRequested` 事件）输出版本化、冻结、无字段值的稳定 ID 请求；宿主完成加载和全局校验后，使用 `update({ document })` 回显权威 Snapshot。

行号区域的鼠标树移动越过拖拽阈值后，进入视口顶部或底部 32px 会按 4–24px 动画帧步长自动滚动；捕获指针移出当前虚拟行窗口时仍会用首/末可见行呈现 `before`/`after` 目标。滚动不修改 Snapshot 或发出请求，只有释放才输出一次无字段值的 `moveSubtree` 稳定 ID 请求；取消、失去捕获、销毁、触摸和无效目标都不会提交。

`Ctrl/Command+Shift+ArrowDown` 展开全部已加载节点，`Ctrl/Command+Shift+ArrowUp` 折叠全部节点；这是视图投影变更，不改变 Snapshot/revision，仅在选区因折叠而收敛时发出 `selectionChanged`，并发出一次 `viewChanged`。

treegrid 还支持未编辑状态下的裸 `Delete`/`Backspace` 清空当前活动格、当前可见单矩形、整行/整列或多范围选区；行号/列头点击、`Shift+Space` 和 `Ctrl/Command+Space` 会产生带 `mode: 'row' | 'column'` 的轴选区，Shift+头部点击可扩展同轴连续范围。IME、AltGraph、自动重复和任意修饰键均不触发，Portal 保留这两个按键的原生文本删除。编辑器先全量预检，再以一个可 Undo 的 `editor:delete` 事务原子提交：多范围按稳定地址去重并受总行数/单元格限额约束；nullable 字段写入 `null`，非 nullable 默认字段通过 `unsetField` 回填默认值，非必填无默认字段通过 `unsetField` 移除。任一目标只读、必填且非 nullable 且无默认值、超限或在提交前过期时，Snapshot 保持不变。鼠标填充柄复用 `editor:fill-down`：它扩展活动范围，并在每个范围至少两行时保留其他多范围同伴；普通多范围复制仍 fail-closed，多范围粘贴可将同一份同尺寸输入矩形以一个原子事务应用到多个不连续范围。快捷键注册表可独立热更新，不改变这些事务边界。
列头边界支持鼠标拖拽调整宽度，双击边界按当前已渲染窗口中的列头和单元格文本自动适应，列头右键菜单也提供“按内容自动调整列宽”；聚焦单元格支持 `Ctrl/Command+Alt+ArrowLeft` 和 `Ctrl/Command+Alt+ArrowRight` 以键盘调整。自动适应只读取已渲染窗口，最多测量 256 行，并将测量文本截断到 4,096 个字符、宽度限制为 1,200 CSS px，避免绕过虚拟化边界或造成异常宽列。列宽更新只改变受控视图几何，不产生文档事务；编辑器按 `minWidth`/`maxWidth` 约束宽度，并通过冻结的 `viewChanged`（`reason: 'columns'`）输出稳定列 ID、宽度和冻结状态。调整时保持横向视口锚点，触摸和 Portal 编辑态不启动调整。

列头支持受控顺序调整：鼠标将可见列头拖过相邻列中心，或聚焦单元格使用 `Ctrl/Command+Shift+ArrowLeft`/`Ctrl/Command+Shift+ArrowRight`，会通过稳定列 ID 顺序回调宿主。第一列树展开列不可移动，交换只能发生在同一冻结起始组或滚动组内；宿主回填完整列定义后，renderer 通过冻结的 `viewChanged(reason: 'columns')` 输出新顺序。顺序调整只改变视图几何，不产生 Snapshot 或 revision，但编辑器会将其纳入交互 Undo/Redo 历史，触摸和 Portal 编辑态不启动调整。

Renderer 内置 `zh-CN`（默认）和 `en-US` 完整控制面语言包。宿主通过 `configurePresentation({ locale })` 切换菜单、编辑 Portal、提示、差异语义与 ARIA/live region 文案；`labels` 可使用固定字符串或静态 `LocalizedText` 覆盖，英文缺失时回退中文。BOM 字段值和宿主业务列标题不会被组件自动翻译。

列显隐也是受控视图状态：`BomColumnDefinition.visible` 省略时默认为 `true`，`Ctrl/Command+Shift+H` 隐藏当前活动的可见列，`Ctrl/Command+Shift+Alt+H` 恢复全部隐藏列。首列树展开列不可隐藏，至少保留一列可见；隐藏列不参与布局、键盘导航、ARIA 列数和复制/粘贴目标。编辑器隐藏活动列后将选区收敛到邻近可见列，宿主通过 `viewChanged(reason: 'columns')` 接收包含 `visible` 的冻结列几何。显隐只更新 view，不产生 Snapshot、revision 或文档事务，但纳入交互 Undo/Redo 历史。

列定义可通过 `headerGroup` 提供多级分组标签。Renderer 对连续且具有相同父路径的可见列段进行跨列合并，Canvas 标签只绘制一次，语义 DOM 增加分组行和 `aria-colspan`；隐藏列、滚动窗口间隙和冻结边界不会被错误合并。视图模板通过 `getViewTemplate()`/`applyViewTemplate()` 和 `bom-view-template/v1` 编解码保存；宿主注入的模板存储可用 `loadResolved()` 做确定性版本迁移，迁移或解析失败时返回默认模板且保留原始值。

treegrid 未编辑态还支持受限 `Ctrl/Command+D` 向下填充和右下角鼠标填充柄：每个当前可见矩形的最上行逐列复制到其余可见行，多个不连续矩形按稳定范围顺序汇总为一个可 Undo 的 `editor:fill-down` 事务；重叠目标若命令不同则整批拒绝，重复目标按稳定地址去重。填充柄仅在提供 `fillDown` 回调、鼠标拖拽到可见活动矩形目标且无轴选区时触发；当每个范围至少两行时，它仅扩展活动范围并保留其他多范围同伴。拖到视口底部 32px 区域会独立向下自动滚动，即使指针越过当前虚拟行窗口也会继续扩展；释放、取消、丢失捕获或销毁时停止。源字段存在时复制规范化值（含 `null`），源字段缺失时对已有目标执行 `unsetField`；等价值跳过。全部目标列必须可编辑，并受 `10,000` 行、`256` 列、`10,000` 单元格及文档/选区过期复核约束，任一失败都不修改 Snapshot。该组合键可能与浏览器书签冲突，renderer 未提供回调时保留浏览器默认行为。默认拖拽为复制填充；按住 `Alt` 开始拖拽时，单范围或合格的多范围选区会改走 `fillSeries()`，活动范围至少提供前两行，其他范围至少提供前三行，以首两行数值或 ISO 时间推导各自序列。相对引用、跨范围扩展及完整隐藏/筛选填充语义仍未开放。

DOM Portal 编辑态还支持受限的 `Ctrl/Command+Enter` 单列批量赋值：活动草稿必须属于当前可见的单列范围；单矩形和多个不连续矩形均可用，但每个矩形至少两行且所有矩形指向同一可编辑列。编辑器只解析和规范化草稿一次，再把同一值赋给全部范围的可见行（包含活动格），重叠 occurrence ID 去重，等价值跳过，并以单一可 Undo 的 `editor:fill-selection` 事务提交。总范围限制为 `10,000` 行、`1` 列、`10,000` 单元格；无效范围、轴选区、跨列范围、IME/AltGraph/自动重复/Shift/Alt、只读或无效目标、Schema 失败以及文档或选区代际变化都不会产生部分修改。无效范围不会劫持浏览器默认行为；成功后不执行 Enter 下移或改变选区。跨隐藏/筛选/折叠、模式序列、相对引用和填充柄批量赋值仍未实现。

`createBomEditorComponent()` 已提供纯前端 Props/Outputs 门面：`document` 是必需输入，其他输入继承编辑器公共选项，`outputs` 集中承载 `onDocumentChange`、`onStructureMoveRequest`、选区/视图/编辑/粘贴和错误回调；该门面不暴露 DataSource，并会在创建和更新时先规范化 Snapshot，拒绝未知 Props、未知输出键和非函数输出。组件在本地乐观 UI 提交后以 `onDocumentChange({ snapshot, commit, patch, origin })` 输出结果，不等待宿主批准；部分 Snapshot 的跨未加载结构移动则只输出 `onStructureMoveRequest`，不改变本地 Snapshot。宿主加载并校验后应以 `update({ document, structureMoveRequestId: request.request.requestId })` 回显；组件会拒绝不存在、过期或 base revision 不匹配的响应。`update({ document, structureMoveRequestId?, outputs? })` 仅允许更新这些受控输入，创建后的 schema 和列定义固定。仅当没有尚未应用的文档替换时，相同 `documentId + revision` 的合法回显会被忽略以保留编辑草稿；其他更新进入既有文档替换队列。输出回调按顺序异步派发、接收冻结事件且异常隔离，`destroy()` 会丢弃尚未派发的输出。

F3 发布证据包 v3 已建立隔离的 `/acceptance.html`、系统 Chrome/Playwright runner、原始样本与哈希归档、固定 30 秒纵向线性三角滚动、Canvas 完整提交像素证据、Chrome 151 presented-frame 提取器、正式长采样前的 cadence precheck、1/3/5 实例 disposable Realm 内存协议，以及 8 个稳定 Core 入口、845 个精确符号映射的 API Extractor 基线。它仍是 **fail-closed 候选证据**：规范路径 `benchmark/environment.json` 已于 2026-08-05 按当前机器环境重新获 `workspace-owner` 批准；但获批环境上的 certified compositor/application correlation、presented-frame blank-frame 判定、完成的 formal Realm、人工 WCAG 2.2 AA/读屏记录与完整 2 小时 soak 证据仍未完成。正式模式因此保持 unqualified，`releaseQualified` 与 `f3Pass` 固定为 `false`；需求状态以[追踪矩阵的 F0–F3 证据快照](./docs/需求追踪矩阵.md#31-f0f3-当前自动证据快照2026-08-05)为准。

最新 formal 报告为 `benchmarks/reports/f3/20260805T175001255Z-formal-8ba027e3/report.json`：环境审批和 cadence precheck 均通过，10 个正式 idle 样本以及 1/3/5 实例 disposable Realm 生命周期均完成，Realm 诊断断言通过，应用像素 raw evidence 也已具备资格。报告仍为 `overall: failed`、`releaseQualified: false`、`f3Pass: false`：compositor trace 因 `BOM_F3_TRACE_DATA_LOSS`（`traced_chunks_discarded: 25`）未通过认证，且 3 个 control Realm 中有一个 `54215` bytes 的变化超过本轮 `46284` bytes 噪声阈值，故 `destroyRetentionQualified: false`。人工 WCAG 2.2 AA/读屏和完整 2 小时 soak 仍未归档。

最新 smoke 为 `benchmarks/reports/f3/20260805T184646680Z-smoke-6480aed5/report.json`：普通 Demo 功能门禁通过，cadence precheck 通过，但 headless trace 仍因 `BOM_F3_TRACE_DATA_LOSS`（`traced_chunks_discarded: 25`）失败关闭；smoke 的 UA-memory、应用像素和 Realm 结果只能作为诊断，不能形成正式资格或替代 formal 归档。

2026-08-05 新增 smoke 归档：`benchmarks/reports/f3/20260805T005047386Z-smoke-222acd7c/report.json`。
该次普通 Demo 功能门禁通过，但报告为 `overall: failed`、`f3Pass: false`：当前 Chrome
运行当时的 Chrome 151.0.7922.71 与批准的 Chrome 150 锁定哈希/版本不一致，GPU 也发生漂移，因而以
`BOM_F3_TRACE_BROWSER_BUILD_UNSUPPORTED` 失败关闭；smoke 本身也不能提供正式 Realm、
WCAG 或 soak 准出证据。该报告是当前环境漂移的诊断证据，不能替换批准环境上的 formal run。
formal runner 已增加环境预检：锁定值不匹配时约在环境采集后立即失败，不再启动长时间
冷启动、滚动和 Realm 采样；smoke 仍保留诊断路径。
随后执行的 formal 归档 `benchmarks/reports/f3/20260805T024328510Z-formal-ea17d197/report.json`
在环境预检阶段约 13 秒 fail-closed，未产生长采样或伪造的正式性能/内存结论。

2026-08-05T03:01Z 已按当前机器重新批准 Chrome `151.0.7922.71`、二进制哈希、revision 和 GPU 设备清单，并注册对应的 `chromium-151-display-frame/v1` Trace profile。上述 formal 已在该锁定环境执行；旧归档仍按当时的 Chrome 150/早期 Chrome 151 状态保留为历史证据，不能自动升级为正式证据。

生成式 AI 不进入首版内核，后续作为可选 `@bom-editor/ai` 插件评估。

## Diff 删除行投影

`BomCanvasDiffView` 支持受控的 `ghostRows`：宿主以稳定删除 ID、`start`/`end` 或锚定的
`before`/`after` 位置以及可选层级描述当前 Snapshot 中已经不存在的行。Ghost 行会参与
Canvas 绘制、滚动高度、可见行位置和 `aria-rowcount`/`aria-rowindex`，但保持只读、不可
选择、不可编辑、不可展开，也不能作为事务目标。`deletedRows` 仍适合只显示不改变行计数的
非交互 `role="note"` 摘要；两种表示都拒绝重复/当前 ID、未知锚点、非法深度和过期绑定。

## 安全单元格 Cut 硬化

安全单元格 `cut` 还实施以下 fail-closed 边界：Schema 带 `defaultValue` 的字段同样拒绝，避免 `unsetField` 后被默认值回填；准备阶段同步限制可见矩形至 `10,000` 行、`256` 列、`10,000` 单元格，并限制 `text/plain` 总输出为 `1 MiB`、每个单元格为 `64 KiB`。删除目标以独立的稳定 `(occurrenceId, fieldId)` 标识去重，不依赖可能歧义的拼接键。原生 `copy` 回退和 `cut` 都只接受可信浏览器事件，因此 synthetic 事件不会请求编辑器 payload 或伪造 `written` 审计；可信 `cut` 还必须成功写入 `ClipboardEvent.clipboardData` 后才允许删除。受控编辑 Portal 的原生 `copy`/`cut` 一律阻断，未提交草稿不能导出、删除或绕过 Clipboard Policy。

## 工作区

```text
docs/                 实施计划、需求追踪和 ADR
packages/contracts/   无 DOM、可序列化的中立协议
packages/model/       规范化、结构不变量、索引与 canonical hash
packages/transaction/ Command、Patch、FIFO 事务与历史
packages/datasource/  DataSource 契约校验与内存实现
packages/visible-projection/ AVL rope 可见投影
packages/runtime/     browser 事件、编辑状态、能力与资源所有权
packages/renderer-canvas/ Canvas、虚拟化、ARIA 与 DOM Portal
packages/editor/      F3 编辑器生命周期和组成层
packages/core/        面向使用者的稳定根入口与子路径 facade
apps/demo/            Vanilla F3 功能与验收入口
benchmarks/fixtures/  版本化 fixture 与 F3 场景定义
benchmarks/scenarios/ F3 headless/browser 证据 runner
benchmark/            白皮书规定的锁定环境审批文件
```

## 命令

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm run f2:coverage
pnpm check
pnpm check:api
pnpm api:update
pnpm test:e2e:f3
pnpm benchmark:f3:browser
pnpm benchmark:f4:headless
pnpm verify:f3
```

`check:api` 对比 8 个稳定入口的已批准 API 报告；`api:update` 只用于有意更新基线，生成的差异必须评审。`test:e2e:f3` 执行 1 次预热 + 3 次样本的 smoke，不具有发布资格；`benchmark:f3:browser` 执行 5 次预热 + 30 次正式样本，但在上述证据缺口关闭前按设计返回非零。每次浏览器运行的报告、原始样本、截图、trace 和文件哈希写入 `benchmarks/reports/f3/<run-id>/`；该复数目录是运行产物目录，不替代白皮书规定的单数审批文件 `benchmark/environment.json`。

所有正式包必须遵循白皮书、需求追踪矩阵和已接受 ADR；出现冲突时以白皮书为最高规范。
