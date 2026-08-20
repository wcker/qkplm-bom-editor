# 现代化高性能可复用 BOM 编辑器组件 · 生产级技术白皮书 v2.0

> 文档状态：规范基线（Normative Baseline）  
> 规范权威：本仓库唯一工程规范源（Single Source of Truth）  
> 适用范围：`@bom-editor/*` 全部正式发布包  
> 责任角色：BOM Editor Architecture Owners  
> 变更机制：版本升级 + ADR + 需求追踪与迁移评审  
> 核心原则：正确性优先于性能，性能必须可复现，扩展不得破坏内核不变量

# 0. 项目定位、边界与规范用语

## 0.1 产品定位

本项目旨在打造行业领先、跨平台、低业务耦合、可商用、可开源、可持续扩展的现代化 BOM 编辑器组件。

产品形态为纯前端通用 SDK，可接入 Vue 3、React 和原生 HTML 应用。组件在无后端时必须具备本地编辑、校验、搜索、导入导出和视图配置能力；持久化、服务端授权、远程数据和多人协作通过标准适配接口接入。

核心产品目标：

- 高性能：面向 1 万至 10 万行工业 BOM，采用虚拟化、索引和增量计算控制主线程成本。
- 高响应：高频输入和编辑反馈以端到端延迟分位数验收。
- 高易用：对齐已公布兼容矩阵内的 Excel/WPS 核心表格操作，并提供完整键盘路径。
- 高智能：提供可解释、可配置、可撤销的匹配、校验、纠错和标准化能力。
- 高复用：框架适配层保持薄封装，领域规则、存储和业务 UI 通过稳定协议注入。

## 0.2 非目标与责任边界

- 组件内的列、行和单元格权限只控制交互，不构成安全授权；最终授权必须由宿主系统或服务端执行。
- Core 不内置特定企业的损耗、单位、替代料、审批等业务规则；这些能力由规则插件或配置提供。
- Core 不承诺替代后端数据库、版本库、协作服务或审计平台，但必须提供接入这些系统的数据和事件契约。
- 不承诺兼容所有浏览器、所有移动设备或 Excel/WPS 的全部历史版本和全部文件特性；支持范围以版本化兼容矩阵为准。
- 不以“零 GC”“绝不掉帧”“绝对零冲突”等不可控绝对结果作为工程承诺，改用明确环境下的统计 SLO。

## 0.3 规范用语

本文中的“必须”“禁止”对应 MUST/MUST NOT，“应”对应 SHOULD，“可以”对应 MAY。标注为必须的条款属于发布门禁；任何例外都必须通过 ADR 记录原因、影响、替代方案和回退路径。

产品定位、竞争力描述与规范性条款必须分离。未经可重复基准验证的“唯一”“最快”“提升若干倍”等结论不得作为技术验收依据。

## 0.4 一致性优先级

发生冲突时按以下顺序处理：

1. 数据正确性、事务原子性和安全边界。
2. 可访问性、用户输入完整性和错误可恢复性。
3. 公开 API、协议和跨适配器兼容性。
4. 性能 SLO 与资源预算。
5. 视觉效果和非核心增强能力。

## 0.5 v1.0 产品合同

本节定义产品范围和准出语言，不替代第 1、14、16 章的工程与发布门禁。`v1.0`
表示首个稳定产品范围；在第 14.5 节全部适用门禁通过前，不得因此宣称 GA、生产可用、
10 万行达标或完整 Excel/WPS 兼容。

### 0.5.1 目标角色与首要任务

产品必须同时服务以下三个角色，并以角色任务而非 API 数量定义完成度：

- **BOM 数据维护者**：在浏览器中浏览树结构、查找、编辑、批量修改、调整视图、校验并
  撤销可恢复的错误操作。
- **宿主应用开发者**：以公开 TypeScript API 在原生 HTML、Vue 3 或 React 中创建、更新、
  销毁组件，接收值无关事件，并把领域数据、授权和持久化接入宿主系统。
- **实施与运维人员**：配置 Schema、列、视图模板、语言、主题、Policy 和 DataSource，诊断
  能力降级、事务失败和远程恢复，而不读取 internal 状态。

v1.0 的首要闭环是：**加载或导入 BOM -> 定位与结构/字段编辑 -> 校验或预览 -> 原子提交、
撤销或恢复 -> 导出/回显受控结果**。Demo、示例、帮助和验收必须围绕该闭环组织，不得仅以
孤立功能清单代替真实任务。

### 0.5.2 产品组成与稳定边界

v1.0 交付由下列产品面组成：

1. **SDK 面**：`@qkplm/bom-editor` 及其已声明稳定子路径、Vue 3、React 与 UMD 薄适配器；
   宿主只能依赖公开出口。
2. **配置面**：版本化 Schema、列定义、`fieldName`/`fieldPath` 绑定、初始视图、主题、语言、
   快捷键、Policy、插件和 DataSource 输入，以及对应的冻结输出事件。
3. **任务面**：离线编辑、受控远程提交与恢复、视图配置、查找、校验/修复、受限导入导出和
   Excel/WPS 剪贴板互操作；每项能力的限制必须在兼容矩阵中明示。
4. **接入面**：原生 HTML、Vue 3、React 各至少一个仅调用公开 SDK 的可运行示例；示例必须
   展示输入数据、输出数据、错误/恢复路径和销毁生命周期，不得通过 Demo internal 绕过协议。

产品不把以下能力伪装成 v1.0 核心承诺：企业审批、替代料、成本、损耗、后端授权、数据库、
多人协作服务、完整工作簿公式/透视表/图表/宏、所有 Excel 文件特性，或未经授权的数据外发。
这些能力只能由宿主、DataSource 或版本化插件/可选包提供。

### 0.5.3 预览、Beta 与 GA 声明

| 级别 | 可以声明 | 禁止声明 | 最低条件 |
| --- | --- | --- | --- |
| Preview | 已实现的公开 API、受限 Demo 流程和明确已知限制 | GA、生产 SLO、全浏览器或完整 Excel 兼容 | API 标注为预览；示例和限制与构建同步 |
| Beta | 版本化 API 候选、声明平台上的端到端任务和迁移路径 | 未经认证的 10K/100K 性能、无障碍或长期稳定性结论 | 三个框架公开接入示例、兼容矩阵、回归与恢复证据 |
| GA | 已发布版本支持矩阵内的完整 v1.0 任务 | 未在矩阵或报告中列出的能力、性能和互操作结论 | 第 14.5、16.1、16.2、16.3 和第 17 章全部适用交付物通过 |

任何对外演示必须显示所用构建版本、当前能力降级、数据规模、已知限制和适用产品级别；
Preview/Beta 的限制不能仅存在于源码注释或测试名称中。

### 0.5.4 产品验收与演进原则

- 每个 v1.0 角色任务必须有公开 API 示例、自动化路径和至少一条错误或恢复路径；功能存在
  但无法由宿主完成任务，不得计入产品完成度。
- 默认示例应以可编辑的 BOM 结构、常用列格式、可见的输入/输出和中文任务说明提供首个
  成功体验；业务规则、字典和持久化凭据不得写入默认配置。
- 新增 Excel 式交互能力前，必须说明它对完整/部分 Snapshot、隐藏/筛选/折叠数据、只读字段、
  Undo/Redo、剪贴板 Policy、键盘路径和无障碍语义的影响；无法给出原子语义时保持失败关闭。
- 产品路线优先顺序为：核心 BOM 任务闭环、接入和恢复体验、生产资格、常用效率功能；不得因
  追求工作簿功能数量削弱领域不变量、协议兼容或性能证据。

# 1. 量化验收标准与基准协议

## 1.1 基准环境

每次正式发布必须在仓库中固化 `benchmark/environment.json`，至少记录：

- CPU 型号、核心数、内存、GPU、操作系统和电源模式。
- Playwright、浏览器及渲染引擎精确版本。
- CSS 视口、`devicePixelRatio`、缩放比例、刷新率和字体版本。
- 生产构建哈希、Worker 数量、缓存状态和功能降级状态。
- 数据 fixture 名称、版本、随机种子、文件哈希和列配置。

至少定义两个设备档位：

- 参考桌面机：硬性性能数字的执行环境，使用固定专用 runner，环境变化必须重新批准基线。
- 最低支持设备：验证功能可用、输入不中断、无持续主线程阻塞和降级策略，不直接套用参考桌面机的全部数字。

性能测试必须使用生产构建，关闭 DevTools 和非必要扩展。每个场景预热 5 次，正式执行至少 30 次并报告 P50、P95、最大值和标准差；发布门禁默认以 P95 为准。启动和首屏类 P99 至少需要 200 个正式样本，连续交互类 P99 至少需要 1000 个事件样本。样本不足时禁止发布 P99，只报告 P50/P95 和最大值。

基准必须固定版本化的 trace 提取器。滚动“帧间隔”定义为脚本滚动窗口内、经提取器认证的相邻 compositor presented frame 时间差，不得使用 RAF、scroll 事件或应用 paint 回调替代；相对锁定刷新周期产生的 missed-vsync 数和空白帧必须同时报告。参考 Chromium profile 以去重后的 `Display::FrameDisplayed` 为权威呈现时间戳；其他 A 级引擎必须提供语义等价、单独版本化并完成重认证的呈现事件。浏览器版本、trace schema 或时钟域变化时，提取器 profile 必须升级并重新批准基线。

## 1.2 标准数据集

必须提供确定性、版本化 fixture：

- `BOM-10K-D6`：1 万行、最大 6 级、固定扇出和字段分布。
- `BOM-100K-D6`：10 万行、最大 6 级嵌套。
- `BOM-100K-FLAT`：10 万行扁平数据。
- 固定 XLSX 文件：记录压缩前后字节数、行列数、工作表数和哈希。
- 固定检索集：精确、前缀、模糊、无命中和高命中查询。

每个 fixture 必须固定总列数、可见列数、冻结列数、计算字段数、平均文本长度、重复物料比例、错误数据比例和展开比例。全部折叠、部分展开和全部展开必须分别测试，不得只选择最有利状态。

## 1.3 性能 SLO

| 指标 | 统一起止点 | 参考桌面机验收门槛 |
| --- | --- | --- |
| 10K cold interactive-ready | 创建实例前至挂载、规范化、索引、首屏绘制完成且可输入 | P95 <= 250ms |
| 100K cold interactive-ready | 同上，输入为已解析 Snapshot，文件解析除外 | P95 <= 400ms |
| ready-instance `setDocument` | 已挂载空实例调用 `setDocument` 至可交互 | 10K P95 <= 250ms；100K P95 <= 400ms，必须与 cold 场景分开报告 |
| first-pixel | 对应场景起点至第一个有效数据像素呈现 | 单独报告，不得替代 interactive-ready |
| 输入反馈 | 原始输入事件至下一次有效呈现 | P95 <= 30ms，P99 <= 50ms |
| 单行祖先汇总 | 提交事务至更新画面呈现，深度不超过 6 | P95 <= 10ms |
| 索引就绪搜索 | 查询提交至 Top-K 结果呈现，包含 Worker 往返 | exact/prefix P95 <= 15ms；fuzzy P95 <= 80ms |
| 60Hz 连续滚动 | 固定轨迹持续 30 秒 | 帧时长 P95 <= 16.7ms，P99 <= 33.3ms，空白帧为 0 |
| 全量展开/折叠 | 命令提交至新投影可交互 | 100K P95 <= 200ms，期间输入反馈仍满足 30ms |
| 长时间稳定性 | 固定操作脚本执行后静默并在测试环境触发可比 GC | 留存增长 <= `max(20MiB, 稳态基线的 5%)`，并满足第 1.4 节趋势门禁 |

### 1.3.1 连续滚动场景与证据协议

参考连续滚动协议 v1 的窗口 ID 为 `f3-10k-scroll-30s`，起止 marker 分别为 `bom:f3:scroll:f3-10k-scroll-30s:start` 和 `bom:f3:scroll:f3-10k-scroll-30s:end`。一次有效测量必须各包含且只包含一个有序 marker，所有呈现帧只在闭合 marker 窗口内统计。窗口目标时长为 30,000ms，允许误差由版本化提取器 profile 固定并随报告导出；窗口缩短、超出容差、身份漂移、重复或缺失 marker 均使结果不具备准出资格。

轨迹固定为单次纵向线性三角波：以场景开始时锁定的 `maximumScrollTop` 为峰值，前 15 秒从 0 线性滚动到峰值，后 15 秒线性返回 0，横向偏移保持 0。请求值、浏览器实际值和同一页面单调时钟下的时间戳必须作为原始证据保存。采集驱动可以使用 RAF、自动化输入或语义等价机制，但驱动回调不得成为呈现帧权威时钟；采样必须覆盖起点、峰值、回零和整个窗口，端点、线性、偏移及最大采样间隔容差由协议版本固定。

原始 compositor trace、应用 scroll/paint/pixel 证据和二者的相关结果必须是三个独立、分别通过 Schema 校验并进入 manifest 哈希的产物，禁止把应用像素结论写回或伪装成 trace 原始证据。相关器必须校验相同 marker 身份和窗口，通过同一窗口映射两套单调时钟，并为每个权威 presented frame 关联不晚于该帧的最近 scroll state 和完整视觉提交。

每个已关联帧必须同时满足：revision 等于场景锁定 revision；请求、实际和已绘制滚动偏移在协议容差内一致；已绘制 surface 覆盖 viewport；逻辑视觉层 readback 成功、像素数正确、存在非透明像素且 checksum 合法。stale、几何覆盖或像素失败对同一呈现帧只计一次失败。视觉状态等价的窗口前提交只有在 revision、滚动偏移和 surface 均匹配时才允许覆盖首个呈现帧。

说明：

- `interactive-ready` 必须包含索引、可见投影和首屏命中测试准备，禁止先画空壳再延迟初始化以规避门槛。
- cold 与 ready-instance 场景都必须包含输入对象规范化和 Core 所有权建立；初始展开状态、校验模式、缓存状态和对象冻结策略由 fixture 固定。
- 文件读取、XLSX 解压和解析不计入“已解析 Snapshot”的首屏指标，必须在导入场景单独报告总耗时、吞吐量、峰值内存和取消延迟。
- 端到端时间必须包含 Worker 排队、消息传输、主线程提交和下一次画面呈现。
- 使用 User Timing、Event Timing、Long Tasks、Chrome Trace 和 UA memory/CDP 指标，禁止只以 RAF 回调次数估算 FPS。
- 固定 runner 上 P95 超过硬门槛，或相对已批准基线回退超过 10%，必须阻止发布，除非 ADR 明确批准。

## 1.4 主线程和内存硬约束

- 连续滚动 30 秒期间，由组件产生的 `>50ms` Long Task 不得超过 1 次。
- 可切片计算的单个主线程任务应控制在 8ms 内，超过预算必须让步、分片或转交 Worker。
- 参考 Chromium runner 必须支持并使用 `performance.measureUserAgentSpecificMemory()` 作为 UA 内存主指标；CDP JS Heap、Worker Heap、ArrayBuffer、GPU 进程和 Canvas 公式估算作为分项诊断，不得互相替代。参考页面必须记录 COOP/COEP 状态和工具版本。
- `BOM-100K-D6` 固定展开状态、列配置和 DPR 下，单实例 ready 后 UA 内存必须不高于 512MiB，场景峰值不高于 768MiB。
- 1920x1080、DPR=2 的 Canvas backing store 公式估算必须不高于 128MiB；超限时必须自动降 DPR、合并图层或缩小 overscan。
- 完成 1000 次编辑、滚动、展开折叠和撤销重做后，必须满足留存总增长门槛。每 200 次操作建立检查点：静默 30 秒、执行两次固定 CDP GC、再等待 5 秒采样。测试前以相同流程采集至少 10 个空闲样本，把相邻差值绝对值的 P95 作为噪声阈值，阈值内变化按 0 处理。另在完整 2 小时稳定性测试中均匀采集至少 12 个检查点，以去噪后的线性回归斜率及其 95% 置信区间作为趋势门禁；斜率置信上界不得高于每 1000 次操作 1MiB。
- 销毁门槛必须在隔离页面中测量；销毁并完成相同静默/GC 流程后，实例专属留存增长不高于 5MiB，且不存在存活的专属 Worker、监听器和定时器。
- Chromium 等浏览器可能在同一 Document 内保留 Canvas 分配器高水位；同 Document 的 Canvas 分类增量只能作为诊断，禁止单独据此判定组件泄漏或通过销毁门槛。正式基线必须先以相同视口、DPR、图层数和实例数执行匹配的 Canvas 预热/销毁及相同静默/GC 流程；仍无法完成所有权归因时，结果必须标记为不可判定并阻止准出。
- 正式销毁测量必须先在实例仍处于原隔离 Realm 时断言 DOM、Canvas 尺寸、Portal、Worker、监听器、Observer、RAF 和定时器账本归零，再移除可丢弃的同源 iframe 或专用页面 Realm，并按相同静默/GC 流程测量总体回收。仅依赖 Realm 移除后的内存回落不得替代原地 `destroy()` 资源断言。
- 1、3、5 实例必须分别压测并报告内存、Worker 队列和输入延迟。

## 1.5 正确性与易用性门禁

- 所有结构变更后必须满足文档不变量；Undo 后的规范 Snapshot 哈希必须与操作前一致。
- 批量粘贴、导入、拖拽和自动修复默认全量成功或全量回滚。
- 错误必须定位到行、列、字段和规则，并提供可执行的恢复路径。
- 支持兼容矩阵内的 Excel/WPS 复制粘贴、导航、选择、编辑和撤销习惯；不以“100% 兼容所有行为”作为模糊承诺。
- 所有鼠标和拖拽核心操作必须有键盘等价路径。
- A、B、C 级平台在各自声明支持的交互范围内都必须达到 WCAG 2.2 AA；A级执行完整桌面任务集，B/C 级执行其受支持功能子集。

# 2. 总体架构与包边界

## 2.1 三层总架构

1. **Core 内核层**：纯 TypeScript 领域模型与版本化浏览器运行时，包含模型、索引、事务、Diff、计算、调度、渲染、Worker 协议、插件协议和导入导出能力。
2. **框架适配层**：Vue 3、React 和 UMD/原生 JS 薄封装，只负责挂载、生命周期桥接、事件转发和参数透传。
3. **Demo 与验收层**：Mock 数据、功能演示、自动化基准、兼容性验证和机器可读验收报告。

三层总架构保持稳定，但“纯 TS”不等于所有代码都可在任意运行时执行。Core 内部必须继续划分无 DOM 模型、浏览器渲染、Worker 和可选文件模块。

## 2.2 Core 子路径与单向依赖

```text
contracts
  <- model
  <- transaction / datasource / plugin-api-headless
  <- runtime
  <- renderer-canvas / plugin-api-browser

worker、import-xlsx 仅依赖 contracts、model 与版本化协议
Vue、React、UMD 适配层仅依赖 @qkplm/bom-editor 公开出口
```

箭头右侧模块只能依赖其左侧上游。`contracts` 只包含可序列化数据类型和中立扩展点；Canvas、DOM、菜单和快捷键接口位于 browser contracts，禁止反向进入 headless model。

Core 至少提供以下稳定子路径：

- `@qkplm/bom-editor/contracts`：跨线程、数据、事件和能力协商的中立类型。
- `@qkplm/bom-editor/model`：数据模型、基础索引、Diff 和结构校验；禁止访问 DOM、Canvas 和 Worker 全局对象。
- `@qkplm/bom-editor/transaction`：命令、Patch、事务和历史记录。
- `@qkplm/bom-editor/datasource`：内存与远程数据源协议。
- `@qkplm/bom-editor/plugin-api/headless`：命令、规则、数据和文件扩展 ABI。
- `@qkplm/bom-editor/plugin-api/browser`：renderer、DOM editor、菜单和快捷键扩展 ABI，仅浏览器运行时使用。
- `@qkplm/bom-editor/runtime`：实例生命周期、调度、资源和能力检测。
- `@qkplm/bom-editor/renderer/canvas`：Canvas 绘制、坐标系统和命中测试。
- `@qkplm/bom-editor/worker`：版本化 Worker 协议和入口。
- `@qkplm/bom-editor/import/xlsx`：可选、异步加载的 Excel 能力，不进入默认首屏包。

Core 根入口在 SSR 或 Node 环境被导入时禁止读取 `window`、`document` 或创建 Worker。浏览器资源只能在挂载后初始化。

## 2.3 架构红线

- 适配层禁止实现性能算法、业务规则、索引、事务或修改 Core 行为。
- UI 组件库不得成为 Core 的运行时依赖。
- 业务规则必须通过 Schema、配置、DataSource 或插件注入。
- 外部只允许依赖公开出口，禁止适配器和插件读取 `internal` 状态。
- 所有全局资源必须由实例资源管理器登记；`destroy()` 后必须可验证地释放。
- 多实例要求数据、焦点、选区、事务和命令逻辑隔离，不强制物理线程一实例一份。
- 包必须定义 ESM 出口、`exports` 条件、`sideEffects`、源码映射、CSS/字体策略、Worker URL、CSP 和包体积预算。
- React StrictMode、Vue 卸载/KeepAlive 和 UMD 重复挂载必须共享适配器契约测试。

## 2.4 能力检测与降级

运行时必须通过特性检测生成只读 `capabilities`，至少包含 Worker、OffscreenCanvas、Clipboard、Pointer Events、ResizeObserver、Intl、安全上下文和内存提示能力。

降级只能降低特效、DPR、overscan、实时模糊搜索频率和并发任务数，不得降低数据正确性、事务原子性或安全校验。Worker 不可用时必须使用可取消、可让步的主线程分片路径。

# 3. 领域数据模型与不变量

## 3.1 规范化 TypeScript 模型

Core 必须分离“物料主数据身份”和“BOM 结构实例身份”。同一物料可以在一份 BOM 中出现多次，每次出现均拥有独立且稳定的 `occurrenceId`；`materialCode` 不得作为行身份或唯一键。

```ts
export type OccurrenceId = string;
export type RevisionToken = string;

export interface BomDecimal {
  readonly $type: 'decimal';
  readonly value: string;
  readonly unit?: string;
}

export interface BomInteger {
  readonly $type: 'integer';
  readonly value: string;
}

export type BomValue =
  | null
  | boolean
  | number
  | string
  | BomInteger
  | BomDecimal
  | readonly BomValue[]
  | { readonly [key: string]: BomValue };

export interface BomNode<
  TFields extends Readonly<Record<string, BomValue>> =
    Readonly<Record<string, BomValue>>
> {
  readonly occurrenceId: OccurrenceId;
  readonly kind: 'material' | 'group';
  readonly materialId?: string;
  readonly materialRevision?: string;
  readonly materialCode?: string;
  readonly parentId: OccurrenceId | null;
  readonly positionKey: string;
  readonly childrenState?: 'complete' | 'partial' | 'unloaded';
  readonly knownChildCount?: number;
  readonly fields: TFields;
}

export interface BomDocumentSnapshot<
  TFields extends Readonly<Record<string, BomValue>> =
    Readonly<Record<string, BomValue>>
> {
  readonly schemaVersion: string;
  readonly documentId: string;
  readonly revision: RevisionToken;
  readonly sourceRevision?: RevisionToken;
  readonly positionKeyCodecVersion: string;
  readonly completeness: 'complete' | 'partial';
  readonly knownRootCount?: number;
  readonly roots: readonly OccurrenceId[];
  readonly nodes: readonly BomNode<TFields>[];
}
```

`positionKey` 是 Core 管理的同级排序键，调用方不得解析或自行拼接。首个稳定 codec 为 `lexicographic-ascii-v1`：键只能包含可打印 ASCII，长度 1–128 字节，以无 locale 的逐 ASCII 字节升序比较；同级键必须唯一。codec 版本属于文档格式，未知版本必须迁移或拒绝，禁止退回 localeCompare。

数量、金额、比例等要求精确计算的字段必须使用 `BomDecimal` 或注册的等价精确类型，禁止直接依赖 IEEE-754 浮点运算。

普通 `number` 只接受有限值；`NaN`、正负 Infinity 必须拒绝，`-0` 规范化为 `0`。Schema `integer` 使用 number 时必须满足 `Number.isSafeInteger`，更大整数使用 `BomInteger`。`BomInteger.value` 必须匹配 `^-?(0|[1-9][0-9]*)$`；`BomDecimal.value` 必须匹配 `^-?(0|[1-9][0-9]*)(\.[0-9]+)?$`，禁止指数、前导 `+`、多余前导零和负零。scale 保留、尾随零和舍入语义由字段 Schema 决定并进入规范哈希。

`revision` 是 Core 实例内单调变化的本地文档版本；`sourceRevision` 是 DataSource 最近一次确认的不可解析版本 token。两者禁止混用，离线纯内存文档可以省略 `sourceRevision`。

## 3.2 字段 Schema

每个 Snapshot 的 `schemaVersion` 必须解析到调用方注册的精确 `BomSchema`，未知主版本必须拒绝，已知旧版本必须先通过确定性迁移器升级。

```ts
export type BomFieldType =
  | { readonly kind: 'string'; readonly maxLength?: number }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'integer'; readonly min?: string; readonly max?: string }
  | {
      readonly kind: 'decimal';
      readonly maxScale?: number;
      readonly roundingMode: string;
      readonly unitFamily?: string;
    }
  | { readonly kind: 'date'; readonly representation: 'iso-date' }
  | { readonly kind: 'datetime'; readonly representation: 'iso-instant' }
  | { readonly kind: 'enum'; readonly values: readonly string[] }
  | { readonly kind: 'json'; readonly maxBytes: number };

export interface BomFieldSchema {
  readonly fieldId: string;
  readonly path: readonly string[];
  readonly type: BomFieldType;
  readonly required: boolean;
  readonly nullable: boolean;
  readonly defaultValue?: BomValue;
}

export interface BomSchema {
  readonly schemaVersion: string;
  readonly fields: readonly BomFieldSchema[];
  readonly allowAdditionalFields: boolean;
  readonly recommendedDepth: number;
  readonly maximumDepth: number;
  readonly canonicalizationVersion: string;
  readonly contentHashAlgorithm: 'SHA-256';
}
```

- `fieldId` 和合法 `path` 在一个 Schema 内必须唯一；路径禁止危险键和空段。
- 默认值必须是可序列化确定值，禁止时间、随机数或可执行函数。
- `required` 与 `nullable` 分别描述字段存在性和值是否可为 `null`，两者不得混用。
- 精确数的 scale、舍入和单位语义由 Schema 固定；展示 locale 不得改变规范值。
- Schema 校验器、格式化器和业务规则通过稳定 ID 引用插件贡献项，不把函数序列化进 Schema。
- 三类哈希均使用 Schema 的规范化版本和带域分隔符的 SHA-256：`valueHash` 只覆盖字段 ID、字段类型和规范字段值，用于 `expectedValueHash`；`contentHash` 覆盖 Schema 版本、position codec、roots、节点身份/结构/物料引用/字段，但排除 document ID、local/source revision 和加载 envelope；`envelopeHash` 覆盖完整 Snapshot 元数据及 `contentHash`。Undo 正确性比较 `contentHash`，交换文件完整性比较 `envelopeHash`。
- 哈希输入采用 UTF-8、对象键 ASCII 升序、数组保序、无非语义空白的 canonical encoding，并带 `bom:value:v1`、`bom:content:v1`、`bom:envelope:v1` 域前缀；算法或 encoding 升级必须迁移或拒绝跨版本比较。

## 3.3 强制不变量

- `occurrenceId` 在文档内唯一、稳定且不可复用；导入、移动、撤销和远程同步禁止使用可见行号作为身份。
- 非根节点的 `parentId` 必须指向已存在节点；`roots` 必须与 `parentId === null` 的集合一致。
- 完整 Snapshot 的整体结构必须无环；孤儿、重复 ID 和无法确定的同级顺序必须在提交前拒绝。
- 部分 Snapshot 的已加载子图必须无环，并通过 `childrenState` 标明未加载或部分加载子级；全局不变量最终由能够看到完整文档的 DataSource 提交端验证。
- 同一 `materialId` 或 `materialCode` 可以对应多个结构实例，相关索引必须为一对多。
- `kind === 'material'` 的节点必须至少具有 `materialId` 或 `materialCode`；`group` 节点可以不关联物料，但不得参与物料精确索引。
- Snapshot 必须只读；所有变更只能通过命令、Patch 或事务产生，禁止调用方原地修改输入对象。
- 索引、缓存、可见投影和计算结果均为派生状态，不得成为持久化事实来源。
- 自定义字段必须符合字段 Schema，禁止危险键、函数、DOM 对象和循环引用。
- 序列化必须确定性输出；相同 Snapshot 在相同协议版本下必须产生相同内容摘要。
- Core 只内置结构不变量；损耗、单位、精度、替代料等规则必须通过配置或插件注入。
- 算法不得硬编码 6 级。默认业务建议深度为 6，同时必须配置异常深链安全上限并使用迭代遍历，防止栈溢出和拒绝服务。
- 根节点顺序以根节点 `positionKey` 排序为唯一事实；`roots` 是该顺序的确定性序列化结果，输入不一致时必须拒绝。
- 完整 Snapshot 必须满足 `knownRootCount === roots.length`（可以省略该字段），且每个节点的 `childrenState` 只能为 `complete` 或省略，`knownChildCount` 省略时等于当前直接子节点数。
- 部分 Snapshot 必须提供 `knownRootCount`，且其值不小于已加载 roots 数。每个节点必须显式设置 `childrenState`：`complete` 表示全部直接子节点已加载，`knownChildCount` 可以省略并规范化为已加载数；`partial` 表示只加载子集，必须提供且 `knownChildCount` 不小于已加载数；`unloaded` 表示尚未加载任何直接子节点且当前已加载数为 0，`knownChildCount` 可以省略或提供已知总数。

## 3.4 状态分层

状态必须分为：

- 领域状态：规范 BOM Snapshot、文档 revision 和已提交事务。
- 视图状态：列配置、排序、筛选、展开、冻结、滚动和模板。
- 交互状态：焦点、选区、编辑草稿、拖拽和快捷键上下文。

撤销策略必须明确每类状态是否随事务恢复。默认 Undo/Redo 恢复领域状态、选区和必要视口锚点，不回滚与数据无关的用户主题和语言偏好。

# 4. 事务、Patch、Diff 与数据源

## 4.1 原子事务

每个事务必须具有 `transactionId`、`baseRevision`、`origin`、时间戳、有序操作列表和可生成的逆操作。Patch 至少支持节点插入、子树删除、节点移动、字段更新和同级顺序调整。

```ts
export type BomOperation<TFields extends Readonly<Record<string, BomValue>>> =
  | { readonly op: 'insertNode'; readonly node: BomNode<TFields> }
  | { readonly op: 'deleteSubtree'; readonly occurrenceId: OccurrenceId }
  | {
      readonly op: 'moveSubtree';
      readonly occurrenceId: OccurrenceId;
      readonly newParentId: OccurrenceId | null;
      readonly positionKey: string;
    }
  | {
      readonly op: 'updateField';
      readonly occurrenceId: OccurrenceId;
      readonly fieldPath: readonly string[];
      readonly value: BomValue;
      readonly expectedValueHash?: string;
    }
  | {
      readonly op: 'unsetField';
      readonly occurrenceId: OccurrenceId;
      readonly fieldPath: readonly string[];
      readonly expectedValueHash?: string;
    }
  | {
      readonly op: 'setMaterialRef';
      readonly occurrenceId: OccurrenceId;
      readonly materialId?: string;
      readonly materialRevision?: string;
      readonly materialCode?: string;
    }
  | {
      readonly op: 'reorder';
      readonly occurrenceId: OccurrenceId;
      readonly positionKey: string;
    }
  | {
      readonly op: 'rebalancePositions';
      readonly parentId: OccurrenceId | null;
      readonly positions: readonly {
        readonly occurrenceId: OccurrenceId;
        readonly positionKey: string;
      }[];
    };

export interface BomPatch<
  TFields extends Readonly<Record<string, BomValue>> =
    Readonly<Record<string, BomValue>>
> {
  readonly protocolVersion: string;
  readonly documentId: string;
  readonly baseRevision: RevisionToken;
  readonly transactionId: string;
  readonly dependsOnTransactionId?: string;
  readonly origin: string;
  readonly idempotencyKey?: string;
  readonly operations: readonly BomOperation<TFields>[];
}

export interface BomCommit {
  readonly transactionId: string;
  readonly previousRevision: RevisionToken;
  readonly revision: RevisionToken;
  readonly patch: BomPatch;
  readonly inversePatch?: BomPatch;
  readonly warnings: readonly BomError[];
}

export type BomPlacement =
  | { readonly at: 'first' | 'last' }
  | { readonly beforeOccurrenceId: OccurrenceId }
  | { readonly afterOccurrenceId: OccurrenceId };

export type BomCommand<
  TFields extends Readonly<Record<string, BomValue>> =
    Readonly<Record<string, BomValue>>
> =
  | {
      readonly type: 'insertNode';
      readonly parentId: OccurrenceId | null;
      readonly placement: BomPlacement;
      readonly node: Omit<BomNode<TFields>, 'parentId' | 'positionKey'>;
    }
  | { readonly type: 'deleteSubtree'; readonly occurrenceId: OccurrenceId }
  | {
      readonly type: 'moveSubtree';
      readonly occurrenceId: OccurrenceId;
      readonly newParentId: OccurrenceId | null;
      readonly placement: BomPlacement;
    }
  | {
      readonly type: 'setField';
      readonly occurrenceId: OccurrenceId;
      readonly fieldPath: readonly string[];
      readonly value: BomValue;
      readonly expectedValueHash?: string;
    }
  | {
      readonly type: 'unsetField';
      readonly occurrenceId: OccurrenceId;
      readonly fieldPath: readonly string[];
      readonly expectedPresent?: boolean;
      readonly expectedValueHash?: string;
    }
  | {
      readonly type: `plugin:${string}`;
      readonly payload: BomValue;
    };
```

字段路径必须由 Schema 解析，不得直接作为任意对象属性写入通道。`expectedValueHash` 用于可选的字段级乐观并发检查，不能替代文档 `baseRevision`。

普通调用方必须使用带 `BomPlacement` 的命令，由 Core 生成不透明 `positionKey`。Patch 中的 key 只允许由兼容 Core 或受信 DataSource 协议产生，`applyPatch()` 必须验证格式、长度和同级顺序。

`lexicographic-ascii-v1` 的 `positionKey` 最大 128 个 ASCII 字节。连续夹缝插入达到上限时，Core 必须在同一原子事务内对受影响兄弟集合执行确定性 rebalance；成本为 O(r)，其中 `r` 为重平衡兄弟数，并通过 `rebalancePositions` 明确记录。`setMaterialRef` 表示完整替换物料引用，省略的引用字段被清除，且提交后仍须满足节点 `kind` 不变量。

- 结构操作必须基于稳定 ID，禁止基于可见行下标。
- 事务必须先完成 Schema、结构、宿主可注入编辑策略和业务规则校验，再一次性提交；编辑策略是客户端防误操作机制，不替代服务端授权。
- 文档、基础索引、搜索索引、计算缓存、可见投影和 revision 必须原子切换。
- 任一步失败时不得暴露半更新状态。
- 嵌套事务合并到最外层；只有具备幂等键的事务允许自动重试。
- 粘贴、拖拽、批量编辑、导入和自动修复默认各自形成单一事务。
- 部分成功模式必须显式启用，并返回逐项状态、错误和实际提交 Patch。

## 4.2 撤销重做

- 历史记录必须同时设定命令数和字节数上限，并支持逆操作日志、合并窗口、检查点和超限淘汰。
- 大型导入和批量粘贴必须使用独立容量策略，禁止把完整 Snapshot 无上限复制进每个历史项。
- 本地 Undo 默认只作用于当前实例产生且已经确认的本地事务；远程事务不得被隐式撤销。
- Undo/Redo 后必须重新验证全部结构不变量，并通过规范 Snapshot 哈希检查确定性。

## 4.3 结构化 Diff

结构 Diff 必须以稳定 `occurrenceId` 为前提，区分新增、删除、移动、同级顺序变化和字段变化。重复 ID 必须返回数据错误，不得退化为猜测匹配。

稳定键 Diff 的目标复杂度为 O(n) 至 O(n log n)。无稳定键的一般树编辑距离不进入核心性能承诺；可选启发式匹配必须返回置信度并允许调用方拒绝。

结构 Diff 是领域/事务层对象，不得直接传给 Canvas、ARIA 或 Live Region。当前 F5 的
渲染投影只能使用值无关的 `BomCanvasDiffView`（协议
`bom-canvas-diff-view/v1`）：它只携带 `documentId`、`documentGeneration`、
`viewRevision`、稳定 `occurrenceId`、稳定 `columnId` 和
`inserted | deleted | changed | moved | reordered | material` 类别。它不得携带
`before`/`after`、字段路径、原始 BOM 值、校验参数、`BomSnapshotDiff` 或
`BomPluginFixProposal.diff`。三元绑定必须与当前已发布 Snapshot 和视图模型完全相等，
不匹配时不得绘制或保留旧覆盖层。

首个投影接受当前 Snapshot 中可定位的地址：行装饰按当前 `occurrenceId`，单元格装饰还按
当前 `columnId` 定位。当前 Snapshot 已不存在的删除行可以使用两种受控表示：
`deletedRows` 只携带删除稳定 ID、正整数数量和当前行 `before`/`after` 锚点或文档
`start`/`end` 位置，renderer 将其绘制为不改变行计数的非交互 `role="note"` 摘要；
`ghostRows` 则为每个删除行提供唯一稳定 ID、`start`/`end` 或带锚点的 `before`/`after`
位置以及可选层级，并把它纳入完整的视觉/语义行投影。Ghost 行参与总高度、可见行位置、
`aria-rowindex` 和 `aria-rowcount`，但必须明确只读、不可选择、不可编辑、不可展开且不能
作为事务目标。删除 ID 重新出现在当前 Snapshot、重复 ID、锚点未知、层级非法或绑定不一致
时必须失败关闭。任何文档替换、事务提交、Undo/Redo 或替换来源导致 revision/代际不再匹配
时，覆盖层必须失效；受控列更新删除其引用列时也必须清除覆盖层。

所有“性能提升倍数”必须附带对照算法、数据 fixture、环境和统计报告，不得以孤立营销数字代替验收。

## 4.4 DataSource 契约

```ts
export interface BomDocumentChunk<
  TFields extends Readonly<Record<string, BomValue>>
> {
  readonly protocolVersion: string;
  readonly sequence: number;
  readonly sourceRevision: RevisionToken;
  readonly nodes: readonly BomNode<TFields>[];
  readonly roots?: readonly OccurrenceId[];
  readonly nextCursor?: string;
  readonly done: boolean;
}

export interface BomPage<
  TFields extends Readonly<Record<string, BomValue>>
> {
  readonly items: readonly BomNode<TFields>[];
  readonly nextCursor?: string;
  readonly sourceRevision: RevisionToken;
  readonly complete: boolean;
}

export type BomQueryExpression =
  | { readonly op: 'and' | 'or'; readonly items: readonly BomQueryExpression[] }
  | { readonly op: 'not'; readonly item: BomQueryExpression }
  | {
      readonly op: 'eq' | 'contains' | 'startsWith' | 'gt' | 'gte' | 'lt' | 'lte';
      readonly fieldId: string;
      readonly value: BomValue;
    };

export interface BomQueryRequest {
  readonly expression?: BomQueryExpression;
  readonly sort?: readonly {
    readonly fieldId: string;
    readonly direction: 'asc' | 'desc';
  }[];
  readonly cursor?: string;
  readonly limit: number;
  /** Captured before request dispatch; a different result revision is stale. */
  readonly expectedSourceRevision?: RevisionToken;
  readonly signal: AbortSignal;
}

export interface BomQueryResult {
  readonly occurrenceIds: readonly OccurrenceId[];
  readonly nextCursor?: string;
  readonly sourceRevision: RevisionToken;
}

export type BomCommitResponse =
  | { readonly status: 'acknowledged'; readonly sourceRevision: RevisionToken }
  | { readonly status: 'rejected'; readonly error: BomError }
  | {
      readonly status: 'conflicted';
      readonly sourceRevision: RevisionToken;
      readonly remoteOperations?: readonly BomOperation<Readonly<Record<string, BomValue>>>[];
    };

export interface BomRemotePatchEnvelope {
  readonly protocolVersion: string;
  readonly documentId: string;
  readonly sourceTransactionId: string;
  readonly sequence: number;
  readonly previousSourceRevision: RevisionToken;
  readonly sourceRevision: RevisionToken;
  readonly operations: readonly BomOperation<Readonly<Record<string, BomValue>>>[];
}

export interface BomRemoteObserver {
  next(envelope: BomRemotePatchEnvelope): void;
  error(error: BomError): void;
  resyncRequired(actualSourceRevision?: RevisionToken): void;
}

export interface BomDataSource<TFields extends Readonly<Record<string, BomValue>>> {
  readonly capabilities: Readonly<{
    streaming: boolean;
    lazyChildren: boolean;
    remoteQuery: boolean;
    writable: boolean;
    remoteChanges: boolean;
    cancelPendingCommit: boolean;
  }>;

  loadDocument(options: {
    signal: AbortSignal;
  }): Promise<BomDocumentSnapshot<TFields>>;

  streamDocument?(options: {
    signal: AbortSignal;
  }): AsyncIterable<BomDocumentChunk<TFields>>;

  loadChildren?(options: {
    parentId: OccurrenceId;
    cursor?: string;
    expectedSourceRevision?: RevisionToken;
    signal: AbortSignal;
  }): Promise<BomPage<TFields>>;

  query?(request: BomQueryRequest): Promise<BomQueryResult>;

  commit?(request: {
    patch: BomPatch;
    expectedSourceRevision?: RevisionToken;
    signal: AbortSignal;
  }): Promise<BomCommitResponse>;

  cancelCommit?(request: {
    transactionId: string;
    idempotencyKey: string;
    signal: AbortSignal;
  }): Promise<{ readonly cancelled: boolean; readonly sourceRevision?: RevisionToken }>;

  subscribeRemote?(observer: BomRemoteObserver): () => void;
}
```

Core 必须内置纯内存 DataSource。远程 DataSource 必须声明搜索、筛选、排序和分页在本地还是服务端执行，并定义一致性 token。

capability 与可选方法必须一致：声明 `streaming/lazyChildren/remoteQuery/writable/remoteChanges/cancelPendingCommit` 为 `true` 时，对应的 `streamDocument/loadChildren/query/commit/subscribeRemote/cancelCommit` 必须存在；声明为 `false` 时 Runtime 不得调用。实例创建时检测到不一致必须返回 `E_DATASOURCE_CAPABILITY_MISMATCH`。

流式 Chunk 和分页结果必须携带稳定顺序、完成状态和一致性 token，并定义重复投递与重试语义。Chunk 先进入隔离 staging model，只有收到 `done`、序号连续、revision 一致且不变量通过后才允许原子替换活动文档；取消或失败必须丢弃 staging 状态。显式 progressive-read 模式只能暴露只读部分 Snapshot。远程只读查询必须绑定请求开始时的 `expectedSourceRevision`；结果 revision、来源会话、文档 ID 或 document generation 任一不一致时必须以过期错误失败关闭，不能改变本地查询投影、选区或 Snapshot。

部分文档默认只读或限制跨未加载边界的结构操作；DataSource 无法证明全局无环时，Core 必须拒绝高风险移动或交由服务端事务校验。按页加载直接子节点时，Core 必须先在隔离 staging Snapshot 中验证 cursor、父子归属、重复 occurrence ID、完整状态和 source revision；只有全部通过才可用一次 `documentReplaced(reason: 'loadChildren')` 原子发布。来源切换、恢复、销毁或 generation 变化必须取消在途查询/分页请求，迟到结果不得写入活动文档；发布后应重建持久化会话，并仅保留仍合法的稳定 ID 选区。

乐观提交必须区分确认、拒绝和冲突。冲突不得静默使用最后写入覆盖，必须采用调用方配置的拒绝、重载或三方变基策略。组件不强制内置 CRDT，但必须允许远程 Patch、版本冲突和审计系统接入。

只有数据源可以重新加载数据时，缓存才允许淘汰权威节点；无外部来源时禁止以“懒卸载”为名丢弃规范数据。

## 4.5 本地提交与远程确认

本地事务和远程持久化采用显式状态机：

```text
localApplied -> pending -> acknowledged
                        -> rejected -> rolledBack
                        -> conflicted -> rebased | rolledBack | reloadRequired
```

- `transactionCommitted` 只表示本地模型、索引和视图已原子提交，不表示服务端已经确认。
- 持久化状态通过 `transactionPersistenceChanged` 事件报告，并携带本地 `revision`、`sourceRevision` 和 transaction ID；进入 `reloadRequired` 时还必须携带版本化 `recoveryId`、是否可重试和 `RecoveryBundle`。
- `BomPatch.baseRevision` 必须等于提交前本地 revision；DataSource 的 `expectedSourceRevision` 必须等于最近确认的 source revision。`idempotencyKey` 只保存在 Patch 中，禁止请求层重复定义不同值。
- 向 writable DataSource 提交的 Patch 必须包含全局唯一 `idempotencyKey`；纯内存事务可以省略。
- acknowledged 后只更新 source revision 和持久化状态；不得重复应用已经本地生效的 Patch。已确认 source revision 与远程订阅 cursor 必须分离维护，延迟到达的 own echo 必须按原 transaction fingerprint、终态 tombstone 和订阅链验证；取消、拒绝、冲突或已要求重载的 own echo 必须失败关闭。
- rejected 默认生成系统来源的原子回滚事务；conflicted 必须进入配置的拒绝、三方变基或重载流程，禁止静默覆盖。
- pending 事务可以 Undo，但必须由 DataSource 能力决定取消原提交还是发送依赖性的补偿 Patch；任何方式都必须保持幂等和事件可审计。取消或确认等待若被调用方 AbortSignal 中断，组件必须及时释放本地 mutation barrier 并进入可恢复的重载状态，不能无限阻塞后续输入。
- 远程 envelope 只携带源端操作和 source revision；Runtime 必须把它转换成以当前本地 revision 为基线的新本地 Patch，禁止直接复用其他实例的 `baseRevision`。
- 远程订阅序号缺口、revision 不连续或未知协议版本必须停止增量应用并触发 `resyncRequired`。

同一文档允许连续本地提交，但 DataSource 远程提交必须严格串行。后续未发送事务通过 `dependsOnTransactionId` 形成有序依赖链，只有前序 acknowledged 后才能使用新的 source revision 发送。

若父事务 rejected/conflicted，Runtime 必须暂停其全部后代，先按逆序回滚后代、再回滚父事务，禁止在仍有后代生效时直接应用父事务 inverse Patch。随后可以在隔离 staging model 中按原命令顺序对后代执行整体重放/变基：全部验证通过才一次性恢复，否则保留版本化 `RecoveryBundle` 并报告冲突，不得静默丢失用户编辑。宿主必须能够通过公开的恢复入口从权威 DataSource 重载该会话；该入口不得静默重发不确定的旧队列。回滚、变基和恢复均必须产生关联原 transaction ID 的审计事件。

# 5. 索引、可见投影、计算与检索算法

## 5.1 复杂度符号

- `n`：BOM 总节点数。
- `v`：当前可见节点数。
- `d`：目标节点深度。
- `k`：直接子节点数或精确查询结果数。
- `s`：受影响子树节点数。
- `a`：本次变更影响的计算依赖闭包节点数。
- `q`：检索索引召回的候选数。
- `L`：参与匹配的平均文本长度。
- `B`：当前操作实际检查、规范化或哈希的字段总字节数。
- `r`：排序键重平衡涉及的兄弟节点数。

## 5.2 算法复杂度契约

| 操作 | 时间复杂度契约 | 备注 |
| --- | --- | --- |
| 基础索引构建 | O(n+B) | 若只构建 ID/父子索引为 O(n)，文本规范化计入 B |
| `occurrenceId` 精确查询 | 期望 O(1)，最坏 O(n) | 依赖哈希实现和负载因子 |
| `materialCode` 精确查询 | 期望 O(1+k) | 编码可以重复，返回实例集合 |
| 获取直接子节点 | O(k) | 获取集合引用可以 O(1)，读取全部结果不是 O(1) |
| 获取祖先链 | O(d) | 必须迭代实现 |
| 局部循环检测 | O(d) | 全量结构校验为 O(n) |
| 仅祖先传播的增量汇总 | O(d) | 只适用于该依赖模型 |
| 通用增量计算 | O(a) | 按依赖闭包更新 |
| 展开/折叠 | O(log v+s) 或更优 | 必须声明实际投影结构 |
| 移动子树 | O(d+s+r) 或更优 | 包含循环检查、索引、投影及可能的排序键重平衡 |
| 无索引通用筛选 | O(n) | 不得宣称 O(1) |
| 索引检索 | O(q+结果数) | 不包含首次索引构建 |
| 模糊评分 | O(q*L) | 先召回有界候选，再执行评分 |
| 同级排序 | `sum(O(k_i log k_i))` | 全局最坏 O(n log n) |
| 排序键重平衡 | O(r) | 生成与应用必须位于同一事务 |
| 稳定键结构 Diff | O(n+B) 至 O(n log n+B) | 取决于移动、排序识别和字段哈希缓存 |
| Snapshot 规范化/首次哈希 | O(n+B) | 后续可复用不可变子树哈希 |

所有算法描述必须同时说明前置条件、平均与最坏复杂度、空间成本以及退化路径。禁止再使用“`O(depth)` 等同恒定 O(1)”或“无限层级下恒定耗时”等表述。

## 5.3 基础索引与可见投影

内核至少维护：

1. `rowById`：稳定实例 ID 到节点记录。
2. `childrenByParent`：保留业务顺序的直接子节点集合。
3. `rowsByMaterialCode`：标准化物料编码到实例 ID 集合。
4. `visibleProjection`：应用展开、折叠、筛选和排序后的可见序列。
5. `rowPositionIndex`：支持 `occurrenceAt(index)`、`indexOf(occurrenceId)`、`occurrenceAtOffset(y)` 和 `offsetOf(occurrenceId)`。
6. 可选检索索引：前缀、别名、拼音和 n-gram 倒排索引。

可见投影应采用分块数组、平衡树、rope、B-tree 或满足同等复杂度和内存要求的数据结构，避免局部展开、折叠和移动时无条件复制完整数组。

固定行高可以使用直接映射；变量行高必须使用前缀和树、Fenwick Tree 或等价结构。纵向行和横向列必须分别虚拟化，冻结列、行头和滚动区域拥有明确坐标变换。

索引一致性测试必须把增量更新结果与从 Snapshot 全量重建的结果进行对照。任何差异都属于发布阻断错误。

## 5.4 增量计算引擎

- 祖先汇总型字段只更新当前节点及其祖先链，复杂度为 O(d)。
- 跨分支公式必须建立显式依赖图，按受影响闭包 O(a) 更新。
- 依赖图必须检测公式循环，使用稳定拓扑顺序并保证相同输入得到相同输出。
- 精确数值计算必须声明 scale、舍入模式、单位和溢出策略。
- 计算任务必须携带文档 revision；过期结果不得提交。
- 批量变更应合并脏节点，禁止对同一依赖链重复计算。
- 全量重算仅允许用于首次构建、明确的全量规则变化、恢复一致性或诊断，并必须异步、可取消和可观测。

## 5.5 智能检索索引

`materialCode` 哈希只负责精确查找，不能支撑模糊搜索。智能检索必须采用分阶段管线：

1. 根据配置执行大小写、空白、Unicode 和区域规则规范化，同时保留原始值。
2. 使用前缀、别名、拼音、分词或 n-gram 倒排索引召回候选。
3. 限制候选数量，再执行编辑距离、规格字段和业务权重评分。
4. 以确定性规则返回 Top-K、各项得分、命中原因和置信度。

必须分别报告首次索引构建、增量索引更新、精确查询、前缀查询和模糊查询的耗时与内存。locale 算法和企业别名字典必须可注入，不得写死在通用 Core 中。

# 6. Canvas 渲染、帧调度与内存治理

## 6.1 渲染模型

采用三层 Canvas 的含义是“失效范围和重绘频率分离”，不代表三个图层天然并行或互不阻塞：

- 底层低频层：背景、边框、层级连接线和固定样式。
- 中层内容层：文本、数值、状态和 Canvas 自定义内容。
- 顶层交互层：选区、焦点、Hover、拖拽目标、错误和快捷键反馈。

Canvas 只覆盖视口、冻结区域和可配置 overscan，禁止创建与全部 10 万行等高的超大画布或为全部行保留绘制对象。无障碍语义和实际文本输入由受控 DOM 层承担。

## 6.2 绘制契约

- 单元格修改优先计算 dirty rect；脏区超过阈值才升级为整层重绘。
- 纵向行和横向列必须双向虚拟化。
- Canvas backing store 按 `width * height * effectiveDPR^2 * 4 * layerCount` 纳入内存预算。
- `effectiveDPR` 必须可配置；高 DPR 或低内存设备允许降 DPR、合并图层或缩小 overscan。
- 文本测量、字体、样式、路径和位图缓存必须有条目与字节双上限。
- 字体完成加载、容器变化、浏览器缩放、DPR 变化和主题变化必须触发正确的失效重绘。
- `contextlost` 或渲染异常必须进入可恢复状态，不能损坏领域数据。
- OffscreenCanvas 作为能力增强，不得成为基础可用性的唯一前提。
- DOM overlay 数量必须有上限，并单独纳入性能和销毁测试。

渲染器必须提供可版本化观测点，用于报告同一 revision、滚动位置和视口下 Canvas、无障碍语义 DOM 及活动 Portal 已完成同步的完整视觉提交。提交至少携带严格递增 sequence、同页面时间原点的完成时间、revision、`scrollLeft`/`scrollTop`、viewport 和已绘制 surface。该语义可以由回调、事件、测试适配器或等价机制实现，不把某个公开 API 名称或调度实现规定为唯一方案。

参考连续滚动协议 v1 在完整视觉提交之后，分别对 `background` 和 `content` 逻辑视觉面执行固定 `64x32` RGBA readback。每层必须报告 readback 状态、2,048 个采样像素、非透明像素数和版本化 checksum；采样区域、缩放、颜色/alpha 口径及 checksum 算法必须由协议版本固定。生产渲染器可以合并物理 Canvas 或采用不同内部分层，但参考场景必须能够取得语义等价的两个逻辑视觉面证据；`64x32` 仅是验收采样尺寸，不是生产 Canvas 尺寸。

## 6.3 坐标、命中与滚动

渲染器必须建立统一的逻辑坐标、CSS 像素和设备像素变换。命中测试不得依赖已经四舍五入的绘制坐标。

滚动定位以稳定 `occurrenceId` 和视口锚点为依据。排序、筛选、展开、变量行高变化和异步字体加载后，应尽可能保持锚点节点及其相对偏移，避免视图跳动。

冻结列、RTL、滚动条、缩放和触摸滚动必须进入同一坐标契约，并具备独立 E2E 测试。

## 6.4 帧预算调度器

RAF 只是帧入口，不具备抢占和优先级能力。调度器必须实现 deadline-based cooperative scheduling：

- 高优先级：输入反馈、焦点、选区、拖拽和活动编辑器定位。
- 中优先级：dirty rect 内容重绘、已提交单元格更新。
- 低优先级：非紧急样式、模板预计算和诊断聚合。

每帧应用脚本预算应不超过 `min(8ms, refreshPeriod * 50%)`。调度器必须支持任务合并、取消、last-write-wins、过期丢弃、优先级老化和防饥饿。超预算计算必须延后、分片或交给 Worker，禁止把大计算简单标记为“低优先级 RAF”。

## 6.5 对象池和缓存

对象池容量只能覆盖“视口对象数 + overscan + 固定余量”，不得保留全部数据行。对象释放时必须清除 DOM、闭包、插件和外部数据引用，并支持主动 `trim()`。

缓存必须同时具备条目数和估算字节数上限，并暴露命中、淘汰和占用指标。压缩块必须定义块大小、压缩算法、随机访问延迟和峰值临时内存；索引仍持有原对象时不得宣称数据已经释放。

内存预算必须覆盖：

- 规范 BOM 数据。
- 基础索引、检索索引和可见投影。
- 事务和撤销重做历史。
- Worker Heap、structured clone 和 ArrayBuffer。
- Canvas backing store。
- 对象池、文字缓存和文件解析临时缓冲。

# 7. Worker 运行时与多实例隔离

## 7.1 Worker 适用范围

Worker 用于文件解析、检索索引构建、批量校验、结构 Diff 和大规模计算。序列化、复制、排队、结果提交和绘制成本必须计入端到端时间。

规范 BOM 的权威版本位于主线程 headless model，以满足同步只读 Snapshot 和原子 UI 提交。Worker 只持有任务局部数据或带 revision 的派生副本，禁止把 Worker 副本作为第二权威来源。

## 7.2 Worker 池

- 默认使用有界共享池。先把 `navigator.hardwareConcurrency` 解析为有限正整数，不可用时按 2 处理，再以 `clamp(floor(value) - 1, 1, config.maxWorkers)` 计算上限；配置也必须夹紧到安全范围。
- 多实例通过 `instanceId`、配额和公平调度实现逻辑隔离，不强制每个实例创建物理 Worker。
- 只有调用方明确配置时才使用独占 Worker。
- 每个任务必须携带 `protocolVersion`、`instanceId`、`taskId`、`documentId`、`documentGeneration`、`documentRevision`、`priority`、任务类型和取消标识。
- 结果提交前必须核对 `documentRevision`；过期结果直接丢弃。
- 大数据优先使用任务专属 Transferable、紧凑二进制结构和字符串字典，禁止高频复制完整 BOM。仍被主线程权威 Snapshot 引用的 ArrayBuffer 禁止转移并 detach；需要转移时必须先创建任务专属派生 buffer 或执行显式原子所有权迁移。

## 7.3 调度、错误与销毁

Worker Runtime 必须支持取消、超时、任务合并、背压、实例公平性、崩溃检测和重建。插件或任务异常不得终止整个共享池。

Worker 崩溃后所有 in-flight Promise 必须在有界时间内结算，默认返回稳定的 `WORKER` 错误。只有纯函数、明确可幂等、输入 revision 未变化且尚未进入提交阶段的任务允许自动重放；事务提交、文件写出和具有外部副作用的任务禁止隐式重放。

实例销毁时必须取消其排队和运行任务、拒绝后续回调并释放实例引用；共享 Worker 仅在无引用时终止。销毁后到达的消息必须安全忽略，并记录不含业务数据的诊断指标。

Worker 不可用、URL 加载失败或受 CSP 限制时，运行时必须返回明确能力状态，并在允许的任务上启用可取消、可分片的主线程降级路径。

# 8. 公开 API、事件、错误与生命周期

## 8.1 最小公开接口

```ts
export type BomResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: BomError };

export interface BomCapabilities {
  readonly worker: boolean;
  readonly offscreenCanvas: boolean;
  readonly clipboard: 'async' | 'event-fallback' | 'unavailable';
  readonly pointerEvents: boolean;
  readonly intl: boolean;
  readonly secureContext: boolean;
}

export interface BomDiagnostics {
  readonly lifecycle: 'created' | 'mounted' | 'ready' | 'destroying' | 'destroyed';
  readonly documentRevision?: RevisionToken;
  readonly sourceRevision?: RevisionToken;
  readonly queuedTasks: number;
  readonly activeTasks: number;
}

export interface BomTransactionBuilder {
  execute(command: BomCommand): void;
  transaction(build: (tx: BomTransactionBuilder) => void): void;
}

export interface BomSearchRequest {
  readonly query: string;
  readonly mode?: 'exact' | 'prefix' | 'fuzzy' | 'regex';
  readonly caseSensitive?: boolean;
  readonly matchWholeCell?: boolean;
  readonly limit?: number;
}

export interface BomSearchResult {
  readonly matches: readonly {
    readonly occurrenceId: OccurrenceId;
    readonly score: number;
    readonly reasons: readonly string[];
  }[];
  /** 命中总数，不受 limit 截断影响。 */
  readonly totalMatches: number;
  /** true 时 matches 只包含前 limit 个稳定排序的命中。 */
  readonly truncated: boolean;
  readonly indexRevision: RevisionToken;
}

export const BOM_CANVAS_DIFF_VIEW_PROTOCOL = 'bom-canvas-diff-view/v1';

export type BomCanvasDiffKind =
  | 'inserted'
  | 'deleted'
  | 'changed'
  | 'moved'
  | 'reordered'
  | 'material';

/** Controlled presentation data only; it is not a BomSnapshotDiff transport. */
export interface BomCanvasDiffView {
  readonly protocol: typeof BOM_CANVAS_DIFF_VIEW_PROTOCOL;
  readonly documentId: BomDocumentId;
  readonly documentGeneration: BomDocumentGeneration;
  readonly viewRevision: RevisionToken;
  readonly rows: readonly Readonly<{
    readonly occurrenceId: OccurrenceId;
    readonly kind: BomCanvasDiffKind;
  }>[];
  readonly cells: readonly Readonly<{
    readonly occurrenceId: OccurrenceId;
    readonly columnId: string;
    readonly kind: BomCanvasDiffKind;
  }>[];
  readonly deletedRows?: readonly Readonly<{
    readonly occurrenceId: OccurrenceId;
    readonly anchorOccurrenceId?: OccurrenceId;
    readonly position: 'before' | 'after' | 'start' | 'end';
    readonly count: number;
  }>[];
}

export interface BomEditPolicy {
  authorize(
    command: BomCommand,
    context: {
      readonly documentId: string;
      readonly revision: RevisionToken;
      readonly origin: string;
    },
    options: { readonly signal: AbortSignal }
  ): Promise<{ readonly allowed: boolean; readonly reasonCode?: string }>;
}

export interface BomPluginGrantPolicy {
  grant(
    manifest: BomPluginManifest,
    options: { readonly signal: AbortSignal }
  ): Promise<readonly BomPluginPermission[]>;
}

/** Successful cell-commit navigation in the browser editor. */
export interface BomEditNavigation {
  readonly enter: 'down' | 'none';
  readonly tab: 'next-editable' | 'none';
}

/** Serializable view state applied during editor construction. */
export interface BomEditorInitialView {
  /**
   * 完整的有序列视图几何。必须恰好包含顶层 columns 的每个 columnId 一次；
   * 只覆盖顺序、宽度、冻结侧和显隐，不改变字段路径、编辑性或格式定义。
   */
  readonly columns?: readonly Readonly<BomViewColumnState>[];
  readonly rowHeight?: number;
  /** Stable per-row height overrides restored by occurrence ID. */
  readonly rowHeights?: readonly Readonly<BomViewRowHeightState>[];
  readonly expandedIds?: readonly OccurrenceId[];
  readonly expandAll?: boolean;
  readonly query?: Readonly<VisibleQueryOptions>;
  readonly selection?: Readonly<BomSelectionState> | null;
  readonly scrollLeft?: number;
  readonly scrollTop?: number;
}

export type BomShortcutContext = 'focused' | 'editing' | 'dragging';

export interface BomShortcutBinding {
  readonly id: string;
  readonly keys: string | readonly string[];
  readonly command: string;
  readonly scope?: BomShortcutContext | readonly BomShortcutContext[];
  readonly priority?: number;
  readonly enabled?: boolean;
  readonly preventDefault?: boolean;
  readonly allowRepeat?: boolean;
}

export interface BomShortcutRegistryOptions {
  readonly bindings?: readonly Readonly<BomShortcutBinding>[];
  readonly sequenceTimeoutMs?: number;
}

export interface BomShortcutDiagnostic {
  readonly code: string;
  readonly severity: 'error' | 'warning';
  readonly id?: string;
  readonly conflictingId?: string;
  readonly stroke?: string;
}

export type BomShortcutConfigurationResult =
  | {
      readonly ok: true;
      readonly state: Readonly<BomShortcutRegistryOptions>;
      readonly diagnostics: readonly Readonly<BomShortcutDiagnostic>[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly Readonly<BomShortcutDiagnostic>[];
    };

export interface BomEditorCommonOptions<
  TFields extends Readonly<Record<string, BomValue>> =
    Readonly<Record<string, BomValue>>
> {
  readonly schema: BomSchema;
  readonly columns: readonly BomColumnDefinition[];
  readonly instanceId?: string;
  readonly protocolVersion?: string;
  readonly initialView?: Readonly<BomEditorInitialView>;
  /** @deprecated Use `initialView.rowHeight`. */
  readonly rowHeight?: number;
  /** @deprecated Use `initialView.expandedIds`. */
  readonly expandedIds?: readonly string[];
  /** @deprecated Use `initialView.expandAll`. */
  readonly expandAll?: boolean;
  readonly history?: Partial<BomHistoryBudget>;
  readonly clipboardPolicy?: BomClipboardPolicy;
  readonly exportPolicy?: BomExportPolicy;
  readonly pastePolicy?: BomPastePolicy;
  readonly pasteLimits?: Partial<Readonly<BomPasteLimits>>;
  readonly editNavigation?: Partial<Readonly<BomEditNavigation>>;
  readonly shortcuts?: Readonly<BomShortcutRegistryOptions>;
  readonly plugins?: readonly BomPlugin<TFields>[];
  readonly pluginGrantPolicy?: BomPluginGrantPolicy;
  readonly pluginHostConfiguration?: Readonly<BomPluginHostConfiguration>;
  /** 显式采纳物料匹配提案前使用的可选宿主批准策略。 */
  readonly matchApprovalPolicy?: BomMaterialMatchApprovalPolicy;
  readonly logger?: BomLogger;
  readonly renderer?: Omit<
    BomCanvasRendererOptions<TFields>,
    'instanceId' | 'shortcuts'
  >;
}

export type BomEditorOptions<
  TFields extends Readonly<Record<string, BomValue>>
> = BomEditorCommonOptions<TFields> & (
  | {
      readonly initialDocument: BomDocumentSnapshot<TFields>;
      readonly dataSource?: never;
    }
  | {
      readonly dataSource: BomDataSource<TFields>;
      readonly initialDocument?: never;
    }
  | { readonly initialDocument?: undefined; readonly dataSource?: undefined }
);

export function createBomEditor<
  TFields extends Readonly<Record<string, BomValue>>
>(options: BomEditorOptions<TFields>): BomEditor<TFields>;

export interface BomPastePreview<TFields extends Readonly<Record<string, BomValue>> = Readonly<Record<string, BomValue>>> {
  readonly inputBytes: number;
  readonly format: BomPasteFormat;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly cellCount: number;
  readonly decisionId: string;
  readonly cells: readonly Readonly<BomPasteCell>[];
}

export type BomPastePreviewResult<TFields extends Readonly<Record<string, BomValue>> =
  | { readonly ok: true; readonly value: Readonly<BomPastePreview<TFields>> }
  | { readonly ok: false; readonly error: BomError; readonly diagnostics: readonly BomPasteCellDiagnostic[] };

export interface BomEditorComponentDocumentChange<
  TFields extends Readonly<Record<string, BomValue>> =
    Readonly<Record<string, BomValue>>
> {
  readonly snapshot: BomDocumentSnapshot<TFields>;
  readonly commit: BomCommit;
  readonly patch: BomPatch;
  readonly origin: string;
}

export interface BomEditorComponentOutputs<
  TFields extends Readonly<Record<string, BomValue>> =
    Readonly<Record<string, BomValue>>
> {
  readonly onDocumentChange?: (
    event: Readonly<BomEditorComponentDocumentChange<TFields>>
  ) => void;
  /** Value-free document identity for binding the next controlled Diff view. */
  readonly onDocumentReplaced?: BomEventListener<TFields, 'documentReplaced'>;
  readonly onStructureMoveRequest?: BomEventListener<TFields, 'structureMoveRequested'>;
  readonly onSelectionChange?: BomEventListener<TFields, 'selectionChanged'>;
  readonly onViewChange?: BomEventListener<TFields, 'viewChanged'>;
  readonly onEditStart?: BomEventListener<TFields, 'editStart'>;
  readonly onDraftChange?: BomEventListener<TFields, 'valueChanged'>;
  readonly onEditEnd?: BomEventListener<TFields, 'editEnd'>;
  readonly onEditRejected?: BomEventListener<TFields, 'commitRejected'>;
  readonly onPaste?: BomEventListener<TFields, 'pasteOperation'>;
  readonly onValidationChange?: BomEventListener<TFields, 'validationChanged'>;
  readonly onMaterialMatchAudit?: BomEventListener<TFields, 'materialMatchAudit'>;
  readonly onClipboardCompleted?: BomEventListener<TFields, 'clipboardCompleted'>;
  readonly onClipboardRejected?: BomEventListener<TFields, 'clipboardRejected'>;
  readonly onTaskProgress?: BomEventListener<TFields, 'taskProgress'>;
  readonly onError?: BomEventListener<TFields, 'error'>;
}

/** Browser component inputs; this facade deliberately has no DataSource. */
export interface BomEditorComponentProps<
  TFields extends Readonly<Record<string, BomValue>> =
    Readonly<Record<string, BomValue>>
> extends BomEditorCommonOptions<TFields> {
  readonly document: BomDocumentSnapshot<TFields>;
  /** Optional value-free Diff overlay for the current document revision. */
  readonly diffView?: Readonly<BomCanvasDiffView> | null;
  readonly outputs?: Readonly<BomEditorComponentOutputs<TFields>>;
}

/** Schema and creation-only options are fixed; document, columns, Diff, and outputs can update. */
export interface BomEditorComponentUpdate<
  TFields extends Readonly<Record<string, BomValue>> =
    Readonly<Record<string, BomValue>>
> {
  readonly document: BomDocumentSnapshot<TFields>;
  readonly columns?: readonly BomColumnDefinition[];
  readonly diffView?: Readonly<BomCanvasDiffView> | null;
  readonly outputs?: Readonly<BomEditorComponentOutputs<TFields>>;
}

export function createBomEditorComponent<
  TFields extends Readonly<Record<string, BomValue>>
>(props: Readonly<BomEditorComponentProps<TFields>>): BomEditorComponent<TFields>;

export interface BomEditor<
  TFields extends Readonly<Record<string, BomValue>> =
    Readonly<Record<string, BomValue>>
> {
  readonly instanceId: string;
  readonly ready: Promise<BomResult<void>>;
  readonly capabilities: Readonly<BomCapabilities>;

  mount(container: HTMLElement): Promise<BomResult<void>>;
  unmount(): BomResult<void>;

  setDocument(
    snapshot: BomDocumentSnapshot<TFields>,
    options?: { signal?: AbortSignal }
  ): Promise<BomResult<void>>;

  setDiffView(
    diffView: Readonly<BomCanvasDiffView> | null
  ): BomResult<void>;

  replaceSource(
    source: BomDocumentSnapshot<TFields> | BomDataSource<TFields>,
    options?: {
      pending?: 'wait' | 'abortAndRollback';
      preserveView?: boolean;
      signal?: AbortSignal;
    }
  ): Promise<BomResult<void>>;

  queryDataSource(
    options: BomEditorDataSourceQueryOptions
  ): Promise<BomResult<BomEditorDataSourceQueryResult>>;

  loadDataSourceChildren(
    parentId: OccurrenceId,
    options?: BomEditorLoadDataSourceChildrenOptions
  ): Promise<BomResult<BomEditorDataSourceChildrenLoadResult<TFields>>>;

  recoverPersistence(
    options?: { signal?: AbortSignal }
  ): Promise<BomResult<void>>;

  execute(
    command: BomCommand,
    options?: { signal?: AbortSignal; origin?: string }
  ): Promise<BomResult<BomCommit>>;

  applyPatch(
    patch: BomPatch,
    options?: { signal?: AbortSignal; origin?: string }
  ): Promise<BomResult<BomCommit>>;

  undo(
    options?: { signal?: AbortSignal; origin?: string }
  ): Promise<BomResult<BomCommit>>;

  redo(
    options?: { signal?: AbortSignal; origin?: string }
  ): Promise<BomResult<BomCommit>>;

  configureShortcuts(
    options: Readonly<BomShortcutRegistryOptions>
  ): BomShortcutConfigurationResult;
  resetShortcuts(): BomShortcutConfigurationResult;

  transaction(
    build: (tx: BomTransactionBuilder) => void,
    options?: { label?: string; origin?: string; signal?: AbortSignal }
  ): Promise<BomResult<BomCommit>>;

  paste(
    input: BomPasteInput,
    options?: { signal?: AbortSignal }
  ): Promise<BomPasteResult<TFields>>;

  pasteText(
    text: string,
    options?: { signal?: AbortSignal }
  ): Promise<BomPasteResult<TFields>>;

  previewPaste(
    input: BomPasteInput,
    options?: { signal?: AbortSignal }
  ): Promise<BomPastePreviewResult<TFields>>;

  getSnapshot(): BomDocumentSnapshot<TFields>;
  getDiagnostics(): Readonly<BomDiagnostics>;

  search(
    request: BomSearchRequest,
    options?: { signal?: AbortSignal }
  ): Promise<BomResult<BomSearchResult>>;

  validate(
    options?: { scope?: 'document' | 'visible' | 'selection'; signal?: AbortSignal }
  ): Promise<BomResult<BomValidationReport>>;

  importData(
    source: BomImportSource,
    options: BomImportOptions
  ): Promise<BomResult<BomImportReport>>;

  exportData(
    options: BomExportOptions
  ): Promise<BomResult<BomExportResult>>;

  installPlugin(
    plugin: BomPlugin,
    options?: { signal?: AbortSignal }
  ): Promise<BomResult<void>>;

  uninstallPlugin(pluginId: string): Promise<BomResult<void>>;
  reloadPlugin(
    pluginId: string,
    replacement: BomPlugin,
    options?: { signal?: AbortSignal }
  ): Promise<BomResult<void>>;

  on<K extends keyof BomEventMap>(
    type: K,
    listener: (event: BomEventMap[K]) => void
  ): () => void;

  focus(): BomResult<void>;
  blur(): BomResult<void>;
  configureShortcuts(
    options: Readonly<BomShortcutRegistryOptions>
  ): BomShortcutConfigurationResult;
  resetShortcuts(): BomShortcutConfigurationResult;
  destroy(): void;
}

export interface BomEditorComponent<
  TFields extends Readonly<Record<string, BomValue>> =
    Readonly<Record<string, BomValue>>
> {
  readonly instanceId: string;
  readonly ready: Promise<BomResult<void>>;

  mount(container: HTMLElement): Promise<BomResult<void>>;
  unmount(): BomResult<void>;
  update(
    input: Readonly<BomEditorComponentUpdate<TFields>>,
    options?: { signal?: AbortSignal }
  ): Promise<BomResult<void>>;
  focus(): BomResult<void>;
  blur(): BomResult<void>;
  setDiffView(
    diffView: Readonly<BomCanvasDiffView> | null
  ): BomResult<void>;
  previewPaste(
    input: BomPasteInput,
    options?: { signal?: AbortSignal }
  ): Promise<BomPastePreviewResult<TFields>>;
  validate(
    options?: {
      scope?: 'document' | 'visible' | 'selection';
      signal?: AbortSignal;
    }
  ): Promise<BomResult<BomValidationReport>>;
  destroy(): void;
}
```

本地 `regex` 查找只接受有界、安全子集：模式与候选文本均受长度上限约束，拒绝回溯引用、前后查找和嵌套量词等可能使主线程失去响应的写法；无效模式返回稳定的 `BOM_EDITOR_SEARCH_REGEX_INVALID`。查找 UI 应提供上一项、下一项、当前项/总项计数、区分大小写及 Enter/Shift+Enter 导航；命中定位到对应单元格并保持可用投影与焦点语义一致。

上面的 `BomEditorCommonOptions` 是当前 F5 编辑器与组件门面接受的精确运行时 Props 白名单；`workerUrl`、导入导出、编辑授权和插件相关的后续设计接口不得作为当前组件 Props 传入，直到其被加入该公开类型。`BomValidationReport`、`BomImportSource/Options/Report`、`BomExportOptions/Result/Policy` 和事件类型属于同一公开类型源。导入、导出、搜索、全量校验和其他可能超过一帧的操作必须返回 Promise、支持 `AbortSignal`，并通过 `taskProgress` 报告单调进度。可选文件模块未加载时返回 `E_CAPABILITY_UNAVAILABLE`。

undo() 与 redo() 是历史引擎的独立程序化入口，不得伪装成插件命令或普通领域命令。它们与 execute()、applyPatch() 共用同一 FIFO 变更队列，成功时返回实际 BomCommit，失败或取消时不得改变 Snapshot、revision、索引或历史游标。

## 8.2 API 行为规则

- `createBomEditor()` 只创建 headless 实例，不访问 DOM；`mount()` 绑定唯一容器并初始化浏览器资源，`unmount()` 释放视图资源但保留模型并允许再次挂载，`destroy()` 才是最终销毁。
- `BomEditorCommonOptions.initialView` 是创建期唯一的可序列化视图状态入口，统一承载列的有序几何、默认行高与按稳定 `occurrenceId` 保存的 `rowHeights` 覆盖、展开/折叠、排序筛选查询、稳定 ID 选区和滚动偏移；其中 `initialView.columns` 可直接采用 `viewChanged.view.columns`，`initialView.rowHeights` 可直接采用 `viewChanged.view.rowHeights`，二者都必须引用当前文档和顶层静态列的有效稳定 ID。顶层 `columns` 继续定义字段路径、编辑性、格式、无障碍元数据与宽度约束，并承担受控列更新职责。视口宽高由挂载容器测量并通过 `viewChanged` 输出。旧的顶层 `rowHeight`、`expandedIds`、`expandAll` 仅作为兼容回退，同名 `initialView` 成员优先。初始列几何、行高覆盖、查询、选区和滚动值在创建期严格校验：查询路径必须属于当前 schema，查询值必须是合法的 `BomValue`；引用未知列/行、不可见或不存在稳定 ID 的选区、展开冲突和非法偏移必须拒绝，不得静默回退到首行。
- `initialDocument` 与 `dataSource` 互斥；两者都未提供时创建空的完整内存文档。DataSource 模式下 `setDocument()` 返回 `E_SOURCE_BOUND`，切换来源必须显式调用 `replaceSource()`。
- `ready` 在首次挂载且初始文档或空文档达到 interactive-ready 后只结算一次。后续 `setDocument()` 通过其 Promise 表示新文档 ready。
- `destroy()` 必须幂等且是唯一返回 `void` 的销毁例外；销毁后 `focus/blur` 和全部异步操作返回 `E_DESTROYED`。`getSnapshot/getDiagnostics` 仍可读取最后有效状态，`on()` 返回无事件的注销函数。
- 外部输入必须规范化为 Core 所有的不可变结构；允许结构共享，禁止为每次读取无条件深拷贝 10 万行。
- `getSnapshot()` 返回只读、不可由调用方原地修改的规范状态，不得暴露内部可变对象、索引或缓存。
- 命令必须定义前置条件、影响范围、可撤销性、幂等性和错误码。
- 同一实例上的变更命令默认按调用顺序 FIFO 串行化。`setDocument()` 是队列屏障：先等待此前已接受命令结算，再替换文档；其后的命令以新 revision 为基线。
- `transaction()` 的 builder 只能同步执行。`builder.transaction()` 以及在同步 builder 内再次调用 `editor.transaction()` 都按词法顺序把命令折叠进同一个原子批次，不产生额外 revision、历史项或事务事件；内层不得携带不同的 `label`、`origin` 或 `AbortSignal`。空 builder、异步 builder、内层构造异常和非法命令均以稳定错误进入同一 FIFO 的 `transactionRejected`，不得提交已收集命令。
- `replaceSource()` 默认等待 pending 远程事务结算；`abortAndRollback` 只有在 DataSource 声明可取消、全部 pending 事务可按队尾到队首取消、且本地历史后缀可一次性原子回滚时生效。任一取消或本地回滚不确定时必须拒绝切换并重载旧权威来源，禁止留下仅客户端可见的取消提交。切换时必须注销旧订阅、取消旧 Worker/校验/检索任务、清空领域历史，并按选项迁移或重置视图。
- 每次文档替换递增内部 `documentGeneration`。所有 Worker、DataSource 和插件异步回调必须携带 `documentId + documentGeneration`；旧 generation 结果只允许结算为过期状态，禁止写入新文档。
- `queryDataSource()` 仅在绑定声明 `remoteQuery` 的 DataSource 时可用，并自动使用当前已确认的 `sourceRevision`；调用方显式给出不同 token 时立即失败。它是只读协议调用，成功结果携带 `documentId` 与 `documentGeneration` 供宿主复核，绝不隐式改变本地筛选、排序、选区或 Snapshot。`loadDataSourceChildren()` 仅对未完整加载父节点的 `lazyChildren` 来源开放；它以当前 revision 和 generation 发起一个有界页请求，先完整校验和 staging，再以 `loadChildren` 文档替换原子发布。两种请求均支持 `AbortSignal`，来源切换、持久化恢复及销毁会中止它们；过期、取消或协议错误不能留下半页数据。
- `setDiffView()` 只接受 `BOM_CANVAS_DIFF_VIEW_PROTOCOL` 定义的值无关投影。编辑器必须在替换当前覆盖层前同时核验其 `documentId`、`documentGeneration`、`viewRevision`、当前行地址和当前列地址；三元绑定不一致返回稳定的 `BOM_EDITOR_DIFF_VIEW_STALE`，未知地址返回配置错误，二者都不得覆盖原有有效覆盖层。事务、Undo/Redo、`setDocument()`、`replaceSource()` 或删除被单元格装饰引用的列后，旧覆盖层必须自动清除。
- 取消在本地原子提交前生效时不得改变文档；提交完成后到达的取消不得伪装成回滚，必须返回实际 `BomCommit` 或明确 `E_ABORT_TOO_LATE`。
- Vue、React、UMD 必须一对一映射同一 Core API，不得更改默认值、错误或事件顺序。
- `createBomEditorComponent(props)` 是面向纯前端 Props/Outputs 集成的浏览器门面。它接收必需的 `document`、继承 `BomEditorCommonOptions`、可选值无关 `diffView`，并只通过可选 `outputs` 向宿主输出交互结果；该门面不接受或暴露 `DataSource`、持久化、远程订阅或来源切换方法。创建期必须显式拒绝运行时传入的 `dataSource`、未知 Props、未知输出键或非函数输出，并先将 `document` 规范化为 Core 所有的不可变 Snapshot，缺失、非法或读取失败的 Props 必须以稳定配置/模型错误拒绝，不能回退为隐式空文档。
- 组件门面的底层编辑器仍按本地乐观事务更新 UI；每次本地事务提交后，`onDocumentChange` 输出冻结的 `snapshot`、`commit`、`patch` 与 `origin`。该输出不是宿主批准请求，也不等待宿主确认；宿主可以据此保存、审计或把 Snapshot 回显给组件。
- 组件还必须转发 `onDocumentReplaced`。该输出的 `event.next` 是值无关的文档引用；宿主用 `next.documentId`、`next.generation` 和 `next.revision` 生成并绑定新文档的下一份 `diffView`，不得从该输出向 Canvas/ARIA 传递 Snapshot Diff 或原值。
- `matchMaterials()` 始终只读，即使结果达到自动选择阈值也不得改变 Snapshot、选区或字段。实际采用必须由宿主显式调用 `proposeMaterialMatch()` 取得当前实例签发的 `BomMaterialMatchProposal`，再调用 `applyMaterialMatch()`；配置 `matchApprovalPolicy` 时，策略批准是该单一事务的前置条件。提案归属、文档 generation/revision 和候选仍需在应用时复核，过期、伪造或被策略拒绝的提案不得写入。
- `update({ document, columns?, diffView?, outputs? })` 允许受控更新文档、列和 Diff 覆盖层，`schema` 与其余创建选项在创建后固定。每次调用都必须先规范化并校验全部输入，然后才可以判断 `documentId + revision` 是否相同；仅当没有尚未应用的文档替换时，同版本合法回显才可以忽略文档替换以保留正在编辑的草稿，其他不同版本或队列中的后续更新必须通过既有 `setDocument()` FIFO 队列应用。数据应用顺序固定为 `document -> columns -> diffView`，使 Diff 核验面对已经采用的新文档代际和最终列集合；若最后一步 Diff 不匹配或引用未知地址，它不得替换为无效覆盖层。非法文档、非法列、结构非法的 Diff、非法输出或额外更新字段必须在应用前失败且不得替换回调或文档；调用开始前已取消也不得替换回调或文档。`outputs` 在输入校验通过且调用进入处理后可以独立替换，即使文档回显被忽略或后续文档替换失败。
- `configureShortcuts()` 与 `resetShortcuts()` 只修改浏览器交互注册表，不触碰 Snapshot、revision、选区或文档队列。配置先在 staging registry 中完成语法、作用域、优先级和冲突检查，再一次性替换当前 registry；失败返回冻结的结构化诊断并保留旧配置。未挂载实例先保存通过校验的配置，下一次挂载使用该配置；销毁后的调用返回 `destroyed` 诊断。

## 8.3 事件时序

至少公开：

- 生命周期：`ready`、`destroyed`、`capabilitiesChanged`。
- 事务：`beforeTransaction`、`transactionCommitted`、`transactionRejected`、`transactionPersistenceChanged`。
- 编辑：`beforeEdit`、`editStart`、`valueChanged`、`beforeCommit`、`commitRejected`、`editEnd`。
- 数据与交互：`documentChanged`、`selectionChanged`、`viewChanged`、`editStateChanged`。
- 文档来源：`beforeDocumentReplace`、`documentReplaced`、`documentReplaceRejected`。
- 校验与后台任务：`validationChanged`、`taskProgress`。
- 匹配采纳审计：`materialMatchAudit`。
- 导入导出：`beforeImport`、`beforeExport`、`exportCompleted`、`exportRejected`。
- 剪贴板：`beforeCopy`、`clipboardCompleted`、`clipboardRejected`。
- 诊断：`error`、`metric`。

所有事件必须携带 `instanceId`、单调递增的 `sequence` 和时间戳。成功的数据变更事件还必须携带 `transactionId`、`origin`、提交前后 revision 和结构化 Patch。事务在命令编译、授权或校验阶段被拒绝时，`transactionRejected` 携带 transaction ID、origin、base revision、结构化错误及可选的已准备 Patch；禁止伪造提交后 revision 或空 Patch。

文档替换不是跨文档事务，不要求伪造 Patch；其事件必须携带旧/新 `documentId`、revision、source 类型、generation 和替换原因。旧文档任务的迟到事件不得进入新 generation 的规范事件序列。

同一事务的标准顺序为：

```text
beforeTransaction
  -> transactionCommitted | transactionRejected
  -> documentChanged（仅提交成功）
  -> validationChanged（如诊断发生变化）
```

事件载荷必须只读。`beforeTransaction`、`beforeEdit`、`beforeCommit`、`beforeImport` 和 `beforeExport` 是同步可取消事件，监听器只能在当前调用栈通过 `preventDefault()` 取消；异步校验和授权使用专门 Policy 接口及 `AbortSignal`，不得让事件 Promise 无限阻塞输入。

中立 @qkplm/bom-editor/contracts 中的事件 envelope 必须保持无函数、可序列化，只用 cancellable: true 标识能力。browser runtime 必须提供独立的强类型 BomEventMap，并仅在同步派发期间把可取消 envelope 包装为带只读 defaultPrevented 和 preventDefault(): void 的 BomRuntimeCancellableEvent。包装对象不得进入 Worker、持久化、日志或 DataSource；派发栈返回后调用 preventDefault() 不得产生效果。编辑、选区和视图事件不得长期停留在无结构的 BomValue payload，F3 对应事件必须在 browser runtime 出口具有稳定的具名字段。

监听器异常不得中断 Core 或其他监听器；监听器内重入调用必须进入队列或返回明确错误，禁止隐式嵌套提交。适配器不得重命名、重排或二次聚合规范事件。

组件门面的 `onDocumentReplaced`、`onSelectionChange`、`onViewChange`、`onEditStart`、`onDraftChange`、`onEditEnd`、`onEditRejected`、`onPaste`、`onTaskProgress`、`onMaterialMatchAudit` 和 `onError` 分别转发既有冻结的 `documentReplaced`、`selectionChanged`、`viewChanged`、`editStart`、`valueChanged`、`editEnd`、`commitRejected`、`pasteOperation`、`taskProgress`、`materialMatchAudit` 和 `error` runtime 事件。`onDocumentReplaced.next` 只用于让宿主取得下一份 Diff 所需的 `documentId`、`generation` 和 `revision`，不传递 Snapshot、Diff 原文或字段原值。`materialMatchAudit` 只包含提案/决策/事务关联及结果等值无关元数据，不得泄露查询文本、候选文本、字段值或命令值。`onDocumentChange` 的包装载荷同样必须冻结。输出按进入门面的顺序进入 FIFO 微任务队列，不得重排或聚合，也不得在 EventHub 的同步派发栈内执行；因此回调可以安全触发组件公开方法。所有输出回调沿用 EventHub 的异常隔离规则：同步抛错或意外的 rejected Promise 不得中断编辑器、其他监听器或事务提交。`destroy()` 是终止边界，必须清除尚未派发的输出并且不再转发销毁过程中产生的终止编辑事件。

## 8.4 错误模型

```ts
export interface BomError {
  readonly code: string;
  readonly category:
    | 'CONFIG'
    | 'DATA'
    | 'VALIDATION'
    | 'CONFLICT'
    | 'ABORTED'
    | 'IO'
    | 'PLUGIN'
    | 'WORKER'
    | 'RENDER'
    | 'SECURITY_LIMIT'
    | 'INTERNAL';
  readonly messageKey: string;
  readonly messageParams?: Readonly<Record<string, string | number>>;
  readonly recoverable: boolean;
  readonly safeContext?: Readonly<Record<string, unknown>>;
}
```

可预期的运行时失败通过 `BomResult` 返回；明显的编程错误可以同步抛出。错误码和 `messageKey` 属于公开兼容契约，UI 通过语言包生成用户文案。原始异常原因只允许保留在经过脱敏的内部诊断通道，不得进入可序列化错误、Worker 消息、日志或遥测。`safeContext` 禁止包含完整 BOM 行、剪贴板内容或敏感字段原值。

## 8.5 生命周期与资源回收

实例状态至少包含 `created -> mounted -> ready -> destroying -> destroyed`，`unmount()` 可以从 mounted/ready 回到 created。销毁必须取消异步任务、终止或解引用 Worker、注销事件、释放 Canvas/DOM、清理 Portal、停止定时器、清空实例缓存、注销插件和快捷键。

React StrictMode 重复挂载、Vue KeepAlive 激活/失活、容器迁移和重复 `destroy()` 必须保持幂等。任何共享资源都必须采用引用计数或等价所有权机制。

## 8.6 公开类型唯一来源

本章代码用于约束主接口形状；可发布版本的唯一机器可读来源是整个公开 export graph 的 `.d.ts` 和聚合 API Extractor 报告。`@qkplm/bom-editor/contracts` 只导出无 DOM、可序列化的中立协议；`@qkplm/bom-editor/runtime` 和 browser 子路径导出 `HTMLElement`、监听器、实例方法及其他浏览器类型。根入口可以聚合这些出口，但不得迫使 headless/Worker 消费者引入 DOM lib。本文引用的每个公开类型都必须从某个已声明公开出口导出，禁止 `any` 和未声明类型。CI 必须在 DOM、WebWorker 和 Node/SSR 三组 TypeScript lib 配置下验证相应子路径可编译，并把聚合 API 报告差异纳入发布审查。

## 8.7 Agent 能力协议

编辑器对 Agent 的开放采用三层边界，禁止把 MCP、HTTP、WebSocket 或 Canvas 事件直接混入领域内核：

```text
Agent / MCP Client
  -> MCP Server 或宿主桥接
  -> bom-editor-capabilities/v1 Adapter
  -> BomEditor 公开 API
```

`bom-editor-capabilities/v1` 是无 DOM、JSON 兼容且与传输无关的领域协议。它定义 `BomAgentRequest`、`BomAgentResponse`、能力目录、输入 JSON Schema 子集、权限、稳定错误码和文档目标。MCP 是面向模型工具发现与调用的标准外层映射：`tools/list` 映射能力目录，`tools/call` 映射一次 request/response，资源使用只读 capability catalog；二进制附件仍由宿主桥接负责。A2A 只用于多个 Agent 的任务委派、状态和产物交换，不用于单元格、事务、视图或 Undo/Redo 的细粒度编辑调用。普通非 Agent 客户端可在同一领域协议之上提供 OpenAPI 或 JSON-RPC 适配。

每个 Agent 请求必须携带固定协议、`requestId`、`instanceId`、`capability` 和值无关 `origin`；需要绑定文档的能力还必须携带 `documentId + documentGeneration`，写文档能力必须携带当前 `baseRevision` 与 `idempotencyKey`。`origin` 仅用于审计关联，绝不是授权凭据。适配器在调用公开 API 前验证实例、代际和 revision；过期请求返回 `BOM_AGENT_DOCUMENT_STALE` 或 `BOM_AGENT_REVISION_STALE`，不得自动重放或覆盖。带同一幂等键的同一写请求返回缓存的原结果；同键不同输入返回 `BOM_AGENT_IDEMPOTENCY_CONFLICT`。

能力以语义而非 UI 手势发布：读取 Snapshot/诊断、查找、校验、DataSource 查询、物料匹配、命令和原子命令批、Patch、Undo/Redo、列和视图模板、焦点、快捷键、展示配置、插件命令、粘贴预览/提交及导入导出均通过稳定 ID 和结构化输入调用。Agent 不得获得 DOM、Canvas、鼠标坐标、内部索引、事务队列、renderer、DataSource 实现或可执行插件对象。不能序列化的宿主生命周期和代码注入操作，例如 mount/destroy、安装同 Realm 插件和替换 DataSource，不属于第三方 Agent 工具面。

授权默认拒绝。宿主必须显式授予 `document:read`、`document:write`、`view:read`、`view:write`、`history:write`、`search:read`、`validation:read`、`datasource:read`、`plugin:execute`、`file:read`、`file:write` 等最小权限，或注入异步授权 Policy。每次调用仍要经过既有 Schema、Policy、事务、导出和插件权限校验。导入和导出的 `Blob`、`ArrayBuffer`、`ReadableStream` 不能放进 JSON 请求；必须由宿主附件桥接解析/存储，组件只接收和返回可序列化附件引用。桥接缺失时返回 `BOM_AGENT_ATTACHMENT_UNSUPPORTED`，不得把二进制内容隐式编码到日志或错误对象。

当前公开实现由 `createBomEditorAgentCapabilityAdapter(editor, options)` 提供。适配器只依赖 `BomEditor` 公开方法，默认没有任何读写授权；宿主可提供静态 `grantedPermissions`、动态 `authorizationPolicy` 和二进制 `attachments`。`createBomEditorMcpAdapter(agentAdapter)` 将同一目录转换为 MCP 的 tools/resource 处理器；`createBomEditorMcpProtocolServer(mcpAdapter, options)` 为单个连接提供 JSON-RPC 会话分发，处理 `initialize`、`notifications/initialized`、`ping`、tools/resources 的 list/call/read 与 `notifications/cancelled`。会话在 initialize 前拒绝 tools/resources，请求 ID 对应在飞 `AbortController`，取消通知只传递中止信号而不伪造执行结果。它不绑定 MCP SDK 或网络传输：MCP Server、浏览器 `MessagePort`、`postMessage`、HTTP 或 WebSocket 层每条连接各自创建一个会话，将已解析消息传给 `handle()`，只回发非 null 响应，并在连接关闭时 `dispose()`。宿主仍必须执行调用方身份认证、源校验、超时、事件转发和审计留存；当前不宣称资源订阅或服务器主动事件流能力。

# 9. 列系统、模板与插件 ABI

## 9.1 用户端列能力

- 批量显隐列。
- 拖拽或键盘调整顺序和宽度。
- 自定义列头别名、说明和无障碍名称。
- 左侧或 RTL 对应起始侧冻结与解冻。
- 单列排序、筛选和多列排序策略。
- 多视图模板保存、切换、重置、复制和导入导出。
- 配置变更必须保持视口锚点，不得无条件重建领域数据。

当前 F5 增量已落地列宽、列顺序和列显隐子集：可见列头边界支持鼠标拖拽，聚焦
单元格支持 `Ctrl/Command+Alt+ArrowLeft`/`Ctrl/Command+Alt+ArrowRight` 键盘调整；
列头拖拽过相邻列中心，或使用 `Ctrl/Command+Shift+ArrowLeft`/
`Ctrl/Command+Shift+ArrowRight` 可调整同组可见列顺序。`visible` 省略时默认为
`true`；聚焦活动列使用 `Ctrl/Command+Shift+H` 隐藏，使用
`Ctrl/Command+Shift+Alt+H` 恢复全部隐藏列。第一列树展开列保持可见且不可移动，
至少保留一列可见，跨冻结组移动被拒绝；所有调整只更新受控视图几何，不产生文档
事务，`viewChanged` 的 `reason: 'columns'` 输出冻结的有序
`{ columnId, width, frozen, visible }` 几何，并保持横向视口锚点。隐藏列不参与
布局、键盘导航、ARIA 列数和剪贴板目标；列头右键菜单还提供插入前后列、删除、隐藏、左右冻结/解冻、升序/降序排序、按当前值筛选、清除排序筛选、清除当前列格式、按内容自动调整列宽和恢复默认列宽，单元格右键菜单提供受信 Clipboard API 的安全粘贴入口。排序与筛选通过视图查询 API 输出，不修改文档事务。列组标签、连续列段跨层级合并表头、基础布局模板 API 和可注入模板存储适配器已实现。

当前 F5 增量还落地变量行高视图：行号右键菜单提供设置行高、按换行内容自动调整和恢复默认行高；编辑器通过 `setRowHeight(occurrenceId, rowHeight)` 更新可见投影，输出冻结的 `viewChanged`（`reason: 'row-height'`）及 `view.rowHeights`。行高只属于视图交互，不修改 Snapshot、revision 或领域事务，并以单次有效变更纳入交互 Undo/Redo；筛选、折叠、结构刷新和重新挂载会保留仍存在的覆盖。导出时先输出当前可见顺序，再追加被筛选/隐藏但仍存在的稳定行 ID 覆盖，避免查询刷新丢失配置。

Renderer 的默认右键菜单和 DOM Portal 编辑器标签使用简体中文；宿主可通过
`labels.contextMenu` 与 `labels.editorLabel` 覆盖文案。该 fallback 不替代完整的
运行时语言包、locale 切换、RTL 和全量读屏文案能力，后者仍按 13.3 的国际化契约验收。

## 9.2 开发者列契约

列 Schema 至少定义稳定 `columnId`、字段标识、字段路径、数据类型、解析器、格式化器、宽度约束、固定状态、默认显隐、可编辑性、排序筛选能力、权限提示和无障碍元数据。列定义中的可选 `fieldName` 必须等于其 `fieldPath` 对应 Schema 字段的 `fieldId`；省略时编辑器会从 `fieldPath` 派生，并在规范化输出、视图模板和导出模板中补齐。`fieldName` 用于稳定地识别 Schema 字段，`fieldPath` 仍是读取、写入、筛选和排序的唯一数据路径，二者不允许指向不同字段。工作台的列设置修改属性名称时必须先解析 Schema，再原子同步更新两者；不能安全绑定 Schema 字段的渲染器元数据列只读显示其绑定。

当前列定义已提供数据化的 `format`、`alignment` 与 `wrapText`：内置格式支持文本、整数、
小数（含保留或隐藏规范值单位）、百分比、货币、会计、科学计数、分数，以及 ISO 日期/日期时间
（可配置短、中、长、完整日期样式及短、中、长时间样式）；货币和会计格式使用 ISO 4217 三字母货币代码；
Canvas 默认渲染据此格式化和对齐。该配置只影响显示，不能替代 Schema 对数据类型、
必填、枚举、精度、舍入和单位合法性的解析与校验；宿主 `formatCellText` 回调仍可显式覆盖
内置显示。换行受当前行高约束，截断不改变可访问文本、复制文本或编辑值。
编辑 Portal 始终保留文本输入以承载 Schema 的规范值；整数、小数、百分比和货币格式
仅设置 `inputmode` 键盘提示，日期与日期时间不触发浏览器本地化输入转换。

支持多级分组表头、自定义 Canvas 单元格和列头绘制、受控 DOM 编辑器及动态扩展字段。禁止用户修改或隐藏关键列属于视图能力，不替代服务端字段授权。

自定义 Canvas renderer 至少实现：

```ts
export interface BomCanvasCellRenderer {
  measure(context: MeasureContext): CellSize;
  draw(context: DrawContext): void;
  hitTest?(context: HitTestContext): HitTarget | null;
  getAccessibleText(context: AccessibleContext): string;
  dispose?(): void;
}
```

当前 `BomCanvasRendererOptions.cellRenderers` 以稳定 `columnId` 注册上述能力；`measure`、
`draw` 与 `getAccessibleText` 为必选同步方法，`hitTest` 与 `dispose` 为可选同步方法。每次调用
只接收 readonly 的表现层上下文：revision、稳定单元格地址、列元数据、当前 value/fields、CSS
像素 `bounds`/`contentBounds`、locale、direction、theme 和受限测量尺寸；`measure` 另有可用
最大尺寸，`draw` 仅额外收到被单元格裁剪的 Canvas context，`hitTest` 仅额外收到 CSS 像素点位。
该上下文不提供命令、事务、选区、布局或数据源写入口，renderer 不得修改领域状态；交互式编辑
仍使用统一 DOM Portal，并遵循焦点、IME、校验和销毁协议。

`cellRendererFrameBudgetMs` 是同一渲染帧内自定义 `measure`、`draw`、
`getAccessibleText` 与 `hitTest` 的聚合预算，默认 `4ms`，配置值上限钳制为 `16ms`。
回调必须同步返回，Promise-like 返回视为失败。异常、非法返回和预算耗尽均输出带阶段、稳定地址、
耗时及预算的结构化诊断；`measure` 或 `draw` 失败/超预算时清理可能的局部绘制并回退内置文本，
`getAccessibleText` 失败/超预算时语义 DOM 回退内置可访问文本，`hitTest` 失败/超预算时继续默认
单元格选择，不能因为扩展失败阻断网格基本可用性。

`hitTest` 返回 `null` 或 `{ id, consume? }`。命中后先调用 value-free 的
`onCellRendererHit({ revision, address, target })`，该输出刻意不包含 value 或 fields；
`consume: true` 阻止本次默认选中，省略或 `false` 则在通知后继续默认选中。实例销毁时由资源登记表
对每个唯一 renderer capability 至多调用一次 `dispose()`，即使它注册到多个列；`destroy()` 幂等，
dispose 异常只记录诊断，不能遗留未受管资源。

受信任同 Realm JavaScript 无法被该组件从技术上阻止发起网络请求或同步解析大数据。因此上述“不得”
是能力契约而非安全沙箱承诺；可执行的防线仅是只读且无领域写入的 API、同步边界、帧预算、回退和
诊断。宿主只能将该入口授予受信任、工作量有界的代码；不可信扩展必须在独立 Worker 或 iframe
沙箱并经可序列化协议接入，不能直接获得 Canvas renderer capability。

## 9.3 模板持久化

模板 envelope 必须包含 `schemaVersion`（模板所绑定的 Schema 版本）、稳定列 ID、语言无关配置及可迁移 metadata。支持内存、localStorage 和宿主后端适配器。

localStorage key 必须包含应用、租户、用户和 Schema 命名空间，并处理额度不足、数据损坏、跨标签更新和版本迁移。迁移失败时保留原数据并回退默认模板，不得覆盖损坏现场。

导出模式不得由视图模板隐式决定，当前视图导出、完整数据导出和可回导模板必须分别选择。

## 9.4 插件清单与生命周期

```ts
export interface BomPluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly abiVersion: string;
  readonly engineRange: string;
  readonly priority?: number;
  readonly capabilities: readonly BomPluginCapability[];
  readonly permissions?: readonly BomPluginPermission[];
  readonly dependencies?: Readonly<Record<string, string>>;
}

export interface BomPluginHostConfiguration {
  readonly engineVersion?: string;
  readonly supportedAbiVersions?: readonly string[];
  readonly supportedCapabilities?: readonly BomPluginCapability[];
  /** 1-60,000 ms; default 10,000 ms. */
  readonly asyncHookTimeoutMs?: number;
  /** 1-1,000 ms; default 16 ms; observation only, never synchronous preemption. */
  readonly syncHookBudgetMs?: number;
}

export interface BomPluginSignal {
  readonly aborted: boolean;
}

export interface BomPluginContext {
  /** Becomes aborted when setup is discarded, the plugin unloads, or the editor is destroyed. */
  readonly signal: BomPluginSignal;
  // pluginId, manifest, negotiatedAbiVersion, grants, permitted reads and host-owned registrations
}

export interface BomPluginCleanup {
  (options: { readonly signal: BomPluginSignal }): void | Promise<void>;
}

export interface BomPlugin {
  readonly manifest: BomPluginManifest;
  setup(context: BomPluginContext):
    | void
    | BomPluginCleanup
    | Promise<void | BomPluginCleanup>;
}
```

插件只能通过 `BomPluginContext` 注册命令、列类型、renderer、编辑器、校验器、修复器、导入器、导出器、快捷键和菜单贡献项。禁止访问内部索引、缓存、事务队列或其他插件私有状态。请求的 permission 必须由宿主授予，未授予能力不得出现在 Context 中。

- 每项贡献必须拥有在插件内唯一的 `contributionId`；完整键为 `pluginId/contributionId`。重复键默认拒绝，覆盖只能通过宿主显式配置且产生诊断事件。
- 每项注册必须返回注销函数，同时由 Runtime 自动登记；实例销毁、禁用、setup 失败和热重载时 Runtime 统一逆序清理，不能只依赖插件主动注销。setup 返回后 Context 不再接受新的注册。
- 初始化顺序按依赖关系、显式优先级、名称和 ID 确定；循环依赖、缺失依赖和不满足的依赖版本范围必须拒绝。
- 同步 hook 调用阶段使用 `syncHookBudgetMs`（默认 `16ms`）观察预算；超限发布值无关的 `plugin.sync-hook.duration` metric（标签为 `pluginId` 和 hook 类型）并记录 warning，但不拒绝已经成功的结果。异步 hook（grant、setup、validator、fixer、command、cleanup）使用 `asyncHookTimeoutMs`，超时会中止传入 signal、丢弃迟到结果并返回 `BOM_EDITOR_PLUGIN_TIMEOUT`。同 Realm JavaScript 不能抢占无限同步循环，预算只能在其返回后诊断。
- 插件异常必须隔离并产生 `PLUGIN` 错误，不得破坏事务原子性。
- 进程内插件默认是可信代码；不可信插件只能在独立 Worker 或 iframe 沙箱中运行。未启用沙箱时禁止宣称安全隔离。
- Worker/iframe 沙箱插件只能注册可 RPC 序列化的 headless 贡献；Canvas 函数、DOM editor 和直接菜单回调只允许受信同 Realm browser 插件。沙箱 UI 必须通过单独的版本化远程视图协议提供。
- 插件握手必须比较 `abiVersion` 和 `engineRange`：未知主版本拒绝，兼容次版本通过 capabilities 协商；不得静默忽略未知必需能力。
- 初始 `plugins` 在实例 ready 前按依赖顺序安装；运行时通过 `installPlugin/uninstallPlugin/reloadPlugin` 管理。安装必须先在 staging registry 完成授权和 setup，全部成功后再原子发布贡献项。
- 热重载失败时必须保留或恢复旧插件版本；禁用和卸载必须先拒绝新调用、取消 in-flight hook、统一清理贡献项。旧 cleanup 失败或超时时，新版本不得发布。
- `BomPluginGrantPolicy` 返回实际授予 permission；请求但未授予的 permission 必须从 Context 移除并形成可观察诊断，禁止默认全量授权第三方插件。

# 10. 编辑、选区、快捷键与剪贴板

## 10.1 编辑状态机

编辑器必须使用显式状态机，禁止用零散 DOM 事件隐式推导状态。

| 状态 | 定义 | 允许的主要操作 |
| --- | --- | --- |
| `idle` | 编辑器未获得交互焦点 | 激活实例 |
| `focused` | 已聚焦但未编辑 | 导航、选择、复制、删除、发起编辑 |
| `editing` | DOM 编辑器已打开 | 输入、选择文本、提交、取消 |
| `composing` | IME 候选合成中 | 仅处理 Composition 事件 |
| `validating` | 同步或异步校验中 | 取消校验，禁止重复提交 |
| `committing` | 事务提交中 | 禁止并发修改同一目标 |
| `rejected` | 校验或提交失败 | 保留草稿、定位错误、重试或取消 |

标准编辑事件顺序：

```text
beforeEdit -> editStart -> valueChange*
  -> beforeCommit -> validate
  -> commit | commitRejected
  -> editEnd
```

`beforeEdit` 和 `beforeCommit` 必须可取消。异步校验必须支持 `AbortSignal`。Enter、Tab、Shift+Tab、Esc、失焦、点击外部、滚动和组件销毁时的提交规则必须可配置并有稳定默认值。

`compositionstart` 至 `compositionend` 期间禁止触发 Enter 提交、组件快捷键、自动格式化、联想提交或字段校验。

当前 F5 切片中，聚焦的活动可编辑单元格接收非合成、非 Dead/AltGraph、无修饰且非重复的可打印键时，应以该字符替换原值并进入编辑；只读列或不满足上述条件的按键不得隐式发起编辑。

成功单元格提交后的连续编辑导航由 `editNavigation` 控制，默认值为 `{ enter: 'down', tab: 'next-editable' }`。`Enter` 在当前列向下定位下一可见行；`Tab` 按可见行优先顺序定位下一个 `editable !== false` 的单元格，`Shift+Tab` 以相反顺序定位。`enter: 'none'` 或 `tab: 'none'` 禁用对应导航。边界没有目标时只完成当前提交，不移动选区。

只有编辑提交成功、`documentGeneration` 与提交发起时相同、选区目标代际未变化且原活动单元格仍是提交目标时，组件才可以移动选区。IME 合成、取消、校验失败、提交失败、文档或选区变化都不得触发导航。发生移动时必须通过既有 `selectionChanged` 输出新选区，随后以既有 `editEnd` 的 `outcome: 'committed'` 输出结束编辑；没有导航目标时不得额外发出 `selectionChanged`。

## 10.2 选区模型

必须定义活动单元格、单元格范围、整行、整列和可选多范围的语义。所有选区均基于稳定行 ID 和列 ID，视图变化后按策略保持、裁剪或清除，不得依赖旧可见下标。

删除、复制、粘贴、填充和批量编辑必须明确如何处理只读单元格、隐藏行列、筛选结果、折叠子树和非连续选区。选区变化必须可撤销与否由命令规范明确说明。

当前 F5 切片已实现稳定端点的单矩形范围、Shift 键盘/单击和鼠标拖拽扩展；鼠标使用 pointer capture 清理拖拽会话，触摸拖动不抢占滚动。普通鼠标矩形选区拖拽进入视口边缘 32px 区域时，会通过有界 `requestAnimationFrame` 自动滚动，单帧增量限制为 4–24px，水平/垂直偏移均钳制在当前投影边界内，并在滚动后继续以最后指针位置扩展选区；释放、取消或销毁时必须取消待执行帧。Ctrl/Command 离散多范围和触摸拖拽不启用该自动滚动。单矩形填充柄也支持鼠标拖拽进入视口底部 32px 区域时的独立向下自动滚动，单帧增量限制为 4–24px，按当前投影总高度钳制，并在滚动后继续以最后指针位置扩展填充目标；释放、取消、丢失捕获或销毁时取消待执行帧。`Ctrl/Command+A` 选择当前可见投影的完整矩形。行号/列头点击、`Shift+Space` 和 `Ctrl/Command+Space` 还可产生带 `mode: 'row' | 'column'` 的整行/整列稳定选区，Shift+头部点击可扩展同轴连续范围；这些选区沿用矩形端点并由 `selectionChanged` 输出。Ctrl/Command+单击单元格可追加或移除一个稳定矩形，输出可选的 `ranges` 完整多范围集合；Ctrl/Command+Shift+单击可追加一个扩展矩形。多范围会在折叠、筛选和文档变化时逐个裁剪并保持稳定 ID，无法安全保留时清除。多范围删除/退格已支持：每个范围独立完成可编辑性、Schema、值哈希和代际预检，按稳定 `(type, occurrenceId, fieldPath)` 去重后以单一可 Undo 的 `editor:delete` 事务提交，并受总行数与单元格限额约束；任一失败都拒绝整个操作。多范围粘贴支持将同一份输入矩形原子地应用到多个同尺寸不连续范围；各目标区域必须完整通过可编辑性、Schema、Policy、代际和总单元格限额预检，重叠区域若把同一目标映射到不同源坐标则整批拒绝，完全重复映射按稳定地址去重。普通多范围复制、填充和多范围填充柄仍 fail-closed，不执行部分修改。单矩形可见范围的右下角提供受限填充柄：鼠标拖拽扩展范围后复用 `editor:fill-down` 原子事务；触摸、轴选区、多范围、不可见目标和未提供 `fillDown` 回调时不触发。填充柄不提供序列、相对引用、跨范围和完整隐藏/筛选/非连续批量语义。

当前 F5 增量还提供受控列宽调整：鼠标在可见列头边界拖拽，或在聚焦单元格上使用
`Ctrl/Command+Alt+ArrowLeft`/`Ctrl/Command+Alt+ArrowRight`，renderer 调用
`resizeColumn(columnId, width, reason)`，宿主同步更新列定义后再发布一次
`viewChanged`（`reason: 'columns'`）。宽度按 Schema 的 `minWidth`/`maxWidth`
钳制，`viewChanged.view.columns` 输出稳定 ID、宽度和冻结状态；该操作不改
Snapshot 或 revision，但会记录为交互历史并可通过 Undo/Redo 恢复宽度和对应选区，
同时保持横向视口锚点。触摸指针、Portal 编辑、
多范围和列头非边界区域不启动宽度调整。

F5 列宽增量（2026-08-12）：可见列头边界双击，或列头右键菜单的“按内容自动调整列宽”，
复用同一受控 `beginColumnResize`/`resizeColumn`/`endColumnResize` 生命周期。自动适应只读取
当前已渲染窗口，最多测量 256 行；每个值最多取 4,096 个字符，结果宽度限制为 1,200 CSS px，
再交给列定义的 `minWidth`/`maxWidth` 钳制。该操作只改变视图几何，不读取未加载数据、不创建
Snapshot 事务，并沿用列宽交互 Undo/Redo 与 `viewChanged(reason: 'columns')` 输出。

列头右键的“恢复默认列宽”使用初始化时保存的静态宽度作为目标；只有宿主回调实际改变
宽度时 renderer 才发布一次 `viewChanged(reason: 'columns')`，无变化或回调失败不产生空事件。

当前 F5 增量同时提供受控列顺序调整：鼠标将可见列头拖过相邻列中心，或在
聚焦单元格上使用 `Ctrl/Command+Shift+ArrowLeft`/
`Ctrl/Command+Shift+ArrowRight`，renderer 调用
`reorderColumns(columnIds, reason)`，宿主校验并回填完整的稳定列 ID 顺序。
第一列树展开列保持不动，交换只能发生在同一 `frozen: 'start'` 组或滚动组内。
成功后通过冻结的 `viewChanged`（`reason: 'columns'`）输出有序列几何；该操作
只修改视图，不修改 Snapshot 或 revision，但会记录为交互历史并可通过 Undo/Redo
恢复列顺序和对应选区。触摸指针、Portal
编辑和跨冻结组移动不启动顺序调整。冻结切换、排序和按当前值筛选可通过列头右键菜单完成；列组标签、连续列段跨层级合并、基础模板获取/应用、模板 JSON 协议及宿主注入的存储适配器已实现。完整 localStorage 命名空间、跨标签同步、版本迁移和损坏恢复仍未实现。

当前 F5 增量还提供受控列显隐：列定义的 `visible` 默认为 `true`，renderer 在
treegrid 焦点内通过 `Ctrl/Command+Shift+H` 调用
`setColumnVisibility([columnId], false, 'keyboard')`，通过
`Ctrl/Command+Shift+Alt+H` 调用 `setColumnVisibility(hiddenIds, true, 'keyboard')`。
宿主校验并回填完整列定义后，renderer 通过冻结的 `viewChanged(reason: 'columns')`
输出每列的 `visible` 状态。首列树展开列不可隐藏，至少保留一列可见；隐藏活动列
时编辑器把选区收敛到最近可见列并发出 `selectionChanged(reason: 'view-change')`。
显隐只修改视图，不修改 Snapshot 或 revision，但会记录为交互历史并可通过 Undo/Redo
恢复显隐状态和对应选区；冻结切换、排序筛选及
基础列布局模板 API、可注入模板持久化适配器、列组标签绘制、连续列段跨层级合并
表头及语义 DOM 的 `aria-colspan` 已实现；完整模板迁移、localStorage 配额/跨标签
同步和损坏现场恢复仍未实现。

当前 F5 切片还实现了 treegrid 焦点内的裸 `Delete`/`Backspace` 单元格清空：仅在未进入 DOM Portal 编辑、非 IME 合成、非 AltGraph、非自动重复且没有 Ctrl/Command/Alt/Shift 修饰时处理。目标为当前活动格、当前可见投影中的单矩形、`mode: 'row' | 'column'` 的整行/整列选区，或可选的多范围集合；先对全部目标做预检，随后只以一个可 Undo 的 `editor:delete` 事务提交，禁止逐格部分成功。多范围按稳定 `(type, occurrenceId, fieldPath)` 去重，重叠范围不会重复写入。字段清空遵循 Schema：`nullable` 字段写入 `null`；非 nullable 且带 `defaultValue` 的字段执行 `unsetField` 并由 Schema 回填默认值；非必填且无默认值的字段执行 `unsetField`。任一目标只读、为必填且非 nullable 且无默认值、超出实现限额，或在提交前发生文档/选区过期时，整个操作必须保持 Snapshot 不变。Portal 编辑态不劫持 `Delete`/`Backspace`，由原生文本输入处理。

当前 F5 切片还实现 treegrid 焦点内的 `Ctrl/Command+D` 单矩形向下填充，以及单矩形右下角的受限鼠标填充柄：键盘路径仅在未编辑、非 IME/AltGraph、非自动重复、无 Shift/Alt 时处理；填充柄仅作用于可见目标，轴选区、多范围、触摸或未提供 `fillDown` 回调时不触发。当前可见矩形的最上行是源行，逐列复制到其余可见行；没有范围或范围只有一行时不创建事务。每个目标列必须 `editable`，并在提交前受 `10,000` 行、`256` 列、`10,000` 单元格限制。源字段存在时以其规范化值写入目标（包括 `null`），源字段缺失时对已有目标执行 `unsetField`；等价值跳过。任一列只读、目标/Schema 无效或文档/选区过期时整批失败关闭。成功路径只产生一个可 Undo 的 `editor:fill-down` 事务。填充柄拖到视口底部 32px 区域时会独立向下自动滚动，单帧增量限制为 4–24px，并按当前投影边界钳制；释放、取消、丢失捕获或销毁会停止自动滚动。另提供 `Ctrl/Command+Alt+Shift+D` 数值序列填充，以前两行步长生成后续可见行，遇到非数值、只读列或过期选区时整批失败。该组合键可能与浏览器书签命令冲突；renderer 未配置对应回调时不阻止浏览器默认行为。填充柄不提供模式、相对引用、跨范围和隐藏/筛选的完整填充语义。

当前 F5 结构编辑切片已接通稳定 ID 的键盘和指针结构闭环：未编辑且 treegrid 聚焦时，`Insert` 复制当前节点为同级节点，`Ctrl/Command+Insert` 复制为最后一个子级并展开父节点；`Alt+ArrowUp`/`Alt+ArrowDown` 调整同级顺序，`Alt+ArrowLeft` 提升到父级同级，`Alt+ArrowRight` 缩进到前一个同级节点下，`Shift+Delete` 删除当前子树。完整 Snapshot 上，行号区域的鼠标拖拽只在释放时提交，拖动中绘制源行影子，并对目标显示 `before`、`after` 或 `inside` 插入线/轮廓；自身和后代目标拒绝，触摸、活动 Portal 编辑和无效目标 fail-closed。renderer 通过 `moveSubtree({ occurrenceId, targetOccurrenceId, position, occurrenceIds? })` 输出稳定 ID、无字段值的受控请求；从已选行开始拖拽时保留当前可见多选并按可见顺序输出 `occurrenceIds`，编辑器把单行编译为一个 `moveSubtree`，多行编译为一个有序批量事务。批量事务拒绝重复 ID、选中祖先/后代重叠和目标循环，释放前不写 Snapshot，成功后复用既有文档变更、Undo/Redo 和 Props/Outputs 事件，拖入折叠目标时先展开目标。部分 Snapshot 上，键盘和指针移动不伪造本地事务，而是发出 `structureMoveRequested` 运行时事件及 `bom-structure-move-request/v1` 请求；请求冻结且只携带 `documentId`、`documentGeneration`、`baseRevision`/`sourceRevision`、稳定源 ID，以及键盘方向或指针目标/位置。宿主完成未加载结构加载和全局环校验后，通过纯前端组件的 `update({ document })` 回显权威 Snapshot；请求期间本地 Snapshot/revision 不变。目标位置变化可由 `labels.liveRegion.treeMoveTarget` 以本地化 `{position}` 播报，释放成功后由 `treeMoveCompleted` 播报。新增、移动和删除分别复用 `insertNode`、`moveSubtree` 和 `deleteSubtree` 事务。新增节点保留源节点经过 Schema 规范化的字段及物料引用，仅生成新的 occurrence ID；跨未加载边界的本地事务仍未实现。

F5 树拖拽自动滚动增量（2026-08-11）：行号区域的鼠标树移动在超过拖拽阈值后，进入顶部或底部 32px 视口边缘时以独立 `requestAnimationFrame` 循环按 4–24px 步长纵向滚动；捕获指针离开当前虚拟行窗口时，首/末可见行继续提供 `before`/`after` 预览。滚动本身不更改 Snapshot、revision、Patch 或事务，renderer 仍只在释放时输出一次无字段值的稳定 ID `moveSubtree` 请求；取消、失去捕获、销毁、触摸和无效目标均失败关闭。

F5 填充增量校正（2026-08-11）：`Ctrl/Command+D` 现在支持多个不连续可见矩形，每个矩形以首行为源行并按稳定范围顺序汇总到一个可 Undo 的 `editor:fill-down` 事务；`fillSeries()` 同样按每个矩形的前两行独立推导数值或 ISO 时间步长，并汇总为一个 `editor:fill-series` 事务。两条路径的重叠目标若命令不同则整批拒绝，重复目标按稳定 `(occurrenceId, fieldPath)` 去重。鼠标填充柄仍限定为单矩形。

F5 填充柄增量校正（2026-08-12）：鼠标填充柄现可用于多范围选区的活动范围；默认拖拽仅扩展活动范围并保留其余稳定范围，释放后复用同一 `editor:fill-down` 原子事务处理全部范围。为保证每个范围都有首行源，所有范围必须至少两行；按住 `Alt` 时，活动范围至少提供前两行，静态同伴至少提供前三行，释放后复用一个 `editor:fill-series` 原子事务并由各范围独立推导数值或 ISO 日期/日期时间步长。触摸、轴选区、含单行同伴、不可见目标、只读/Schema/代际失败及重叠命令冲突仍整批拒绝。相对引用、跨范围扩展和完整隐藏/筛选语义仍未实现。

同一切片还提供 `Ctrl/Command+Shift+ArrowDown` 展开全部已加载节点和 `Ctrl/Command+Shift+ArrowUp` 折叠全部节点。两者只替换可见投影，不修改 Snapshot、revision 或历史；活动行在折叠后按稳定 ID 规则收敛，并通过既有 `selectionChanged`/`viewChanged` 输出状态变化。部分 Snapshot 只作用于已加载结构，不宣称跨未加载边界的全局展开。

当前 F5 切片还实现 DOM Portal 编辑态的 `Ctrl/Command+Enter` 单列批量赋值：活动草稿必须属于当前可见的单列范围；单矩形和多个不连续矩形均可用，但每个矩形至少两行且所有矩形必须指向同一可见列。IME、AltGraph、自动重复、Shift 或 Alt 均不触发。无效范围不阻止浏览器默认行为，也不提交草稿。编辑器先按活动列 Schema 解析并规范化草稿一次，再把同一值写入全部范围的可见行（包括活动格）；重叠范围按稳定 occurrence ID 去重，等价值跳过。总范围受 `10,000` 行、`1` 列、`10,000` 单元格限制。`beforeCommit` 仅为该草稿派发一次；任一范围、列、Schema、目标或代际预检失败，或在 `beforeTransaction` 前后发生文档/选区变化时，整批保持 Snapshot 不变并保留草稿。成功路径只产生一个可 Undo 的 `editor:fill-selection` 事务，不执行 Enter 连续编辑导航，也不额外改变选区。轴选区仍 fail-closed；跨隐藏/筛选/折叠、模式序列、相对引用和填充柄批量赋值仍未实现。

## 10.3 四态快捷键作用域

保留四种上下文，但重新定义边界：

- 非活动态：实例未聚焦，默认不拦截宿主页面命令键。
- 聚焦态：实例为活动键盘所有者，未编辑单元格。
- 编辑态：DOM 编辑器正在输入，文本编辑和 IME 优先。
- 拖拽态：行、列或结构键盘移动正在进行。

快捷键注册时必须检测组件内部冲突并返回结构化诊断。优先级为“更具体上下文 > 用户配置 > 系统默认”，但 OS、浏览器和辅助技术保留键属于不可保证项。

只允许活动实例拦截支持的组合键；不得影响宿主输入框、其他实例和 IME 合成。必须定义 `KeyboardEvent.key/code`、键盘布局、自动重复、序列超时和 macOS Command 映射策略。

## 10.4 默认快捷键

基础表格兼容目标：Ctrl/Command+C、V、Z、Y、A、F、D，Delete/Backspace，Enter，Esc，Tab 和 Shift+Tab。

当前 F5 切片已在 treegrid 焦点内接线 `Ctrl/Command+Z` 到既有 Undo，`Ctrl/Command+Y` 与 `Ctrl/Command+Shift+Z` 到既有 Redo、行号/列头点击及 `Shift+Space`/`Ctrl/Command+Space` 轴选区、Ctrl/Command+单击多范围选区、裸 `Delete`/`Backspace` 清空、受限的 `Ctrl/Command+D` 单矩形向下填充和受限鼠标填充柄；结构快捷键还包括 `Insert`/`Ctrl/Command+Insert` 新增同级/子级、`Alt+ArrowUp`/`Alt+ArrowDown` 调整同级、`Alt+ArrowLeft`/`Alt+ArrowRight` 提升/缩进、`Shift+Delete` 删除子树，以及 `Ctrl/Command+Shift+ArrowDown`/`Ctrl/Command+Shift+ArrowUp` 展开全部/折叠全部；DOM Portal 编辑态还接线受限的 `Ctrl/Command+Enter` 单列批量赋值。列宽调整新增 `Ctrl/Command+Alt+ArrowLeft`/`Ctrl/Command+Alt+ArrowRight`，与既有树结构 `Alt+ArrowLeft`/`Alt+ArrowRight` 不冲突。快捷键注册表已支持按稳定 `id` 覆盖默认绑定、`enabled: false` 解绑、追加高优先级命令、最多四步组合键序列、`focused`/`editing`/`dragging` 作用域、热更新和重置；同作用域同优先级冲突以冻结结构化诊断拒绝，OS/浏览器保留键返回 warning。`BomEditor.configureShortcuts()`、`resetShortcuts()` 及 renderer 同名入口均原子替换注册表，失败保留旧配置；未知命令交由可选 `onShortcut` 回调，不能跌落执行另一内置命令。IME、Alt/AltGraph、自动重复（除非绑定显式允许）及无效 Portal 范围不拦截这些路径。轴选区不触发填充快捷键；多范围键盘填充仍按各命令的限额和冲突规则执行，合格多范围 `Alt` 填充柄则会扩展活动范围并调用 `fillSeries()`。`Ctrl/Command+D` 可能与浏览器书签冲突，只有 renderer 提供回调时才阻止默认行为。填充柄拖到视口底部 32px 区域时会独立向下自动滚动；Undo/Redo 已按稳定行列 ID 恢复提交前后的选区，并通过受限滚动定位尽可能恢复提交前后的视口偏移。剪贴板 `cut` 仍必须走受信任的原生事件，改绑到自定义键时无法安全伪造该事件，宿主应保留原生绑定或使用自定义命令自行实现授权路径。

列显隐默认快捷键为 `Ctrl/Command+Shift+H` 隐藏当前活动列，及
`Ctrl/Command+Shift+Alt+H` 恢复全部隐藏列；两者只在 treegrid 聚焦、未编辑且
通过受控 `setColumnVisibility` 回调时消费事件，首列和至少一列可见约束由宿主校验。

BOM 增强默认值：展开全部、折叠全部、新增子级、复制分支和批量纠错。具体组合键必须经过浏览器/OS 冲突矩阵验证；检测到保留键时应提供替代绑定，而不是承诺强制覆盖。

支持运行时热重载、组合键、序列键、解绑、禁用、重置和优先级配置。配置更新必须原子替换注册表，不得在中间状态重复执行命令。

## 10.5 剪贴板契约

```ts
export interface BomClipboardRequest {
  readonly operation: 'copy' | 'cut';
  readonly occurrenceIds: readonly OccurrenceId[];
  readonly fieldIds: readonly string[];
  readonly formats: readonly ('text/plain' | 'text/html' | 'internal')[];
}

export interface BomClipboardDecision {
  readonly decisionId: string;
  readonly allowed: boolean;
  readonly fieldIds?: readonly string[];
  readonly maskingByFieldId?: Readonly<
    Record<string, 'omit' | 'redact' | 'hash'>
  >;
  readonly reasonCode?: string;
}

export interface BomClipboardPolicy {
  authorize(request: BomClipboardRequest): BomClipboardDecision;
}

export const BOM_INTERNAL_CLIPBOARD_MIME =
  'application/x-bom-editor-clipboard+json';

/** All values are untrusted text captured from an API caller or ClipboardEvent. */
export interface BomPasteInput {
  readonly internal?: string;
  readonly html?: string;
  readonly text?: string;
  /**
   * Incremental text source for bounded TSV/CSV staging. It is mutually
   * exclusive with `text`; chunks are consumed only while the paste task is
   * active and the iterator is closed on cancellation or rejection.
   */
  readonly textStream?: AsyncIterable<string>;
}

export interface BomPasteLimits {
  readonly maxBytes: number;
  readonly maxRows: number;
  readonly maxColumns: number;
  readonly maxCells: number;
  readonly maxCellBytes: number;
}

export interface BomPastePolicy {
  authorize(request: BomPasteAuthorizationRequest): BomPasteDecision;
}
```

复制和剪切在生成任何外发格式前必须执行同步 `BomClipboardPolicy`。Policy 可以拒绝、裁剪字段或应用预定义脱敏；所有外部和内部剪贴板格式必须使用同一决策，禁止内部格式绕过。剪切只有在授权复制成功且剪贴板写入成功后才能提交删除事务。决策和结果产生不含原值的审计事件；该 Policy 只防误泄漏，不替代宿主或服务端授权。

首个单元格剪切切片必须进一步采取保守语义：仅处理当前可见单矩形中的可编辑、非必填、无 `defaultValue` 且实际存在的字段；带默认值的字段在 `unsetField` 后会被 Schema 规范化回填，必须整体拒绝，除非模型另行引入“显式清空且不回填”的值语义。剪切前必须以同步上限拒绝超过默认 `10,000` 行、`256` 列、`10,000` 单元格、单元格 `64 KiB` 或总 `1 MiB` UTF-8 输出的选区，且不得在超限后继续分配完整命令或 TSV；目标去重必须使用无歧义的稳定行 ID/字段 ID 结构，禁止使用可由合法 ID 内容碰撞的字符串拼接键。以一个可 Undo 的 `editor:cut` 批事务对每个稳定行 ID/字段路径执行带 `expectedPresent` 和值哈希前置条件的 `unsetField`。只要 Policy 裁掉任一目标字段，或对任一目标字段采用 `omit`、`redact`、`hash`，就必须整体拒绝剪切，禁止出现“源值已删除但未原样外发”的结果。Clipboard 写入确认后、提交前必须再次核对 `documentId`、`documentGeneration`、revision 和视图挂载代际；任何失配、写入失败、持久化不可写或事务拒绝都不得修改 Snapshot。

审计必须区分外发确认和数据变更：`clipboardOperation` 的 `written` 仅证明 Clipboard 已成功写入，`transactionCommitted` 且 `origin: 'editor:cut'` 才证明删除事务已提交。原生 `copy` 回退和键盘单元格 cut 都必须固定走浏览器受信任的事件；不可信或脚本合成事件必须阻止默认行为，且不得请求 payload、写入成功审计或提交删除。写入后因版本失配或事务失败而未删除时，必须额外给出不含值的失败结果或事务拒绝，不能把 `written` 误报为剪切完成。树/分支剪切必须作为独立命令设计，不能把普通单元格范围剪切退化为 `deleteSubtree`。运行时把 `grid.cut` 改绑到自定义键时不得伪造原生事件，必须 fail-closed 消费该按键；宿主如需自定义剪切入口，应注册独立命令并自行提供等价授权、写入确认和审计路径。

`decisionId`、`reasonCode` 和单元格拒绝码是值无关的审计 token，必须限制为最长 64 个 ASCII 字符，首字符为字母或数字，后续只允许字母、数字、`.`、`_`、`:`、`-`；不符合规则的 Policy 决策必须作为无效决策拒绝，禁止把剪贴板原文、转换值或字段值写入审计事件。

编辑态 DOM portal 承载的是未提交草稿，不能成为 Policy 或审计的旁路。首个切片必须阻止 portal 的浏览器原生 `copy` 和 `cut` 默认行为；后续若支持草稿级 Clipboard，必须先定义等价的授权、脱敏、审计和提交/撤销语义。

- 对外复制在同一次授权下提供 `text/plain` TSV、无脚本/无样式注入的安全 `text/html` 表格，以及同一编辑器生态可识别的版本化内部结构格式；三种表示必须使用相同的字段裁剪、脱敏、公式注入防护和默认资源上限（`10,000` 行、`256` 列、`10,000` 单元格、总 `1 MiB`、单元格 `64 KiB`），不得以隐藏 MIME 绕过 Policy。
- 粘贴优先级为有效内部格式、清洗后的 HTML 表格、纯文本 TSV/CSV。`BomPasteInput` 只承载候选表示，不承载来源身份；公开 API 固定标记为 API 来源，浏览器 renderer 固定标记为事件来源。一个候选表示未通过版本/清洗/解析校验时不得阻断较低优先级的安全候选；只有富格式且无可用回退时返回明确的能力或校验失败。
- 默认只复制选区中的可见行列；折叠子孙、筛选隐藏行、隐藏列和表头由显式选项控制。
- “复制分支”是独立命令，不得与普通单元格复制混淆。
- 必须定义换行、制表符、引号、空值、尾随空行、合并单元格、非连续选区、目标尺寸不匹配和只读单元格处理。
- 粘贴管线为“解析 -> 类型转换 -> 权限适配 -> 校验 -> 预览/提交”，默认全量提交或全量回滚。
- 超大剪贴板数据必须分片处理、可取消、有资源上限，并返回单元格级错误报告。
- Clipboard API 不可用、权限拒绝或非安全上下文时，使用 `copy/cut/paste` 事件能力回退并公开限制。
- HTML 输入必须清洗 XSS、危险 URL 和样式注入；CSV/Excel 输出必须防止公式注入。

以下 F5 状态段是阶段快照；其“待实现”列表以紧随其后的“当前 F5 剪贴板增量”更新为准。

当前阶段顺序仍以 F3 首个纵向切片退出门禁为默认路径。F5 增量是受控的兼容性实现，不能
作为 F3/F5 准出证据；在 F3 正式证据（认证呈现帧相关、正式 Realm/内存、人工
WCAG/读屏和 2 小时稳定性）闭合前，不得以任何后续研发结果宣称 F3/F5 准出。

> 状态更新（2026-08-06）：用户已授权依 [ADR-0010](./docs/adr/0010-parallel-f4-performance-kernel-development.md)
> 并行推进 F4 的 100K 性能内核。该例外只授权研发、基准和回归建设；F3 仍是发布阻断项，
> F4 基准不得替代 F3 的认证呈现帧、正式 Realm、人工 WCAG/读屏或 soak 证据。

当前 F5 受限实现已经覆盖受 Policy 约束的三种外发表示和 `text/plain`、安全 HTML 表格、严格 V1 入站内部格式的协作式增量解析：外发同时生成 `text/plain` TSV、转义文本的 `<table><tbody>` `text/html` 和恰为 `{ "format": "bom-editor/clipboard", "version": 1, "kind": "cell-grid-text", "rows": string[][] }` 的内部 JSON；原生事件回退逐项写入三种 MIME，Async Clipboard 在支持 `ClipboardItem` 时一次写入三种 MIME，否则仅在浏览器提供的纯文本异步能力下写入 `text/plain`。三种表示共用字段裁剪、`omit`/`redact`/`hash` 脱敏、公式注入前缀和输出字节上限，Policy 授权和所有限额检查均先于字段读取。内部格式入站只接受非空矩形字符串网格，拒绝重复键、未知键、原型相关键、错误版本/种类、空或非矩形行、非字符串单元格及所有资源上限；它不得承载文档 ID、稳定行 ID、字段路径、命令、Patch、Policy、样式或其他扩展。HTML 解析器不使用 DOM，只读取 `table`/`tr`/`td`/`th` 文本，解码有限实体，丢弃 script/style/embed/iframe 等活动内容，将 `rowspan`/`colspan` 展开为值位于左上角、覆盖位为空字符串的矩形，并对非表格、畸形标记及资源超限失败关闭。候选优先级为 `internal -> html -> text`：任一高优先级候选未通过版本、清洗或解析校验时，可安全降级到下一级同时提供的候选。解析阶段可响应 `AbortSignal`，取消时不得进入 Policy 或事务。调用 `paste()` 或 `pasteText()` 时即占用实例 FIFO 变更队列槽位；解析、目标构建、预检/转换和本地提交均在同一队列任务内执行，随后调用的 `execute()`、粘贴或 `setDocument()` 不得超车。解析完成后、目标预检/转换期间及提交前必须复核 `documentId`、`documentGeneration`、revision 和选区目标代际；文档或目标变化必须以过期结果失败关闭，且不得改变 Snapshot。目标行映射每 256 行协作让步并复核取消与目标代际，预检和转换每 512 个单元格让步。`destroy()` 会中止尚未本地提交的运行中粘贴；`AbortSignal` 在本地提交前（包括同步 `beforeTransaction` 派发期间）触发时必须阻止本地事务，Snapshot 保持不变。当前已实现受 Policy 约束的内部格式外发和多 MIME Clipboard 写入：三种表示共享字段裁剪、脱敏、公式注入防护和输出限额，原生事件逐项写入，支持 `ClipboardItem` 时 Async Clipboard 一次写入。该实现仍是有资源上限的内存路径；受限 Worker 解析、`textStream` staging、粘贴预览和进度已交付，完整 spill/超大数据事务路径和跨格式全量单元格级错误报告仍待实现。

# 10.4.1 当前 F5 剪贴板增量

> 状态更新（2026-08-05）：下文旧快照中的“Worker/流式解析待实现”已由本节后续增量覆盖。
> 当前受限 Worker 和 `BomPasteInput.textStream` 增量 staging 已交付；完整 spill/流式事务
> 路径与跨格式全量错误报告仍未交付。

在上述受限剪贴板切片基础上，当前实现已补齐只读 `previewPaste()` 和
`taskProgress` 阶段输出。预览与正式粘贴共用 internal -> HTML -> text 解析、
目标映射、Schema 转换、`pastePolicy` 和代际/取消检查；预览只返回冻结的
规范化目标单元格，不创建事务、不改变 Snapshot。两条管线都在同一 FIFO
任务中运行，并发出值无关、单调的阶段进度（parse、prepare、authorize、
commit/preview、complete）；组件门面通过 `onTaskProgress` 转发该输出。
普通 `copy` 与安全 `cut` 均受默认 `10,000` 行、`256` 列、`10,000` 单元格、
总 `1 MiB` 和单元格 `64 KiB` 上限约束；独立树/分支剪切首个切片也已交付：活动行或连续整行选区作为根，
默认包含所有已加载后代且不受折叠影响，要求完整 Snapshot；`copy-branch`/`cut-branch`
拥有独立 Policy operation、`branch-tree` 内部包和审计，可信 Async Clipboard 写入成功后以
`editor:cut-branch` `deleteSubtree` 批事务提交。V1 分支粘贴已支持：接收端重新校验完整
节点结构和 Schema，为每个节点生成新的稳定 occurrence ID，按活动行之后或活动分组之下
插入，复用 `pastePolicy` 后以一个 `editor:paste-branch` `insertNode` Undo 批事务提交；
HTML/文本大纲不会降级为树数据。受限 Worker/流式解析已交付；完整大数据 spill/流式事务路径
和完整单元格级错误报告仍属于后续增量。

2026-08-05 增量：受限纯文本解析已增加 Worker 旁路。仅超过实现阈值且运行时提供 Worker
时启用；任务携带 `documentId`、`documentGeneration` 和版本化协议，Worker 只返回结构化
解析结果，不接触权威 Snapshot 或事务。取消、销毁、协议/上下文失配、Worker 启动失败和
运行时崩溃均在主线程丢弃结果并回退到等价协作式解析。`BomPasteInput` 现可提供互斥的
`textStream: AsyncIterable<string>`，流适配器在消费时执行 UTF-8 资源限额，并以两个候选
解析器增量 staging TSV/CSV 行；正常结构化输入不再先拼接完整字符串，跨 chunk 保留引号、
CR/LF 和 UTF-16 代理对语义，取消或失败会尝试关闭来源迭代器。无分隔符的纯文本才保留
原文以复用规范文字语义；rows、转换单元格和最终命令批次仍受限额约束，因此该切片不是
完整 spill/超大数据事务管线。粘贴准备会聚合同一请求中的目标、只读和类型转换诊断，任一
诊断仍全量拒绝且不提交有效单元格；跨格式全量错误报告仍待实现。

2026-08-11 增量：纯文本、HTML 和 V1 internal 解析失败现可返回冻结的、值无关的首个
`sourceRow`/`sourceColumn` 诊断。诊断覆盖 malformed quote、malformed HTML/internal
envelope、输入/行/列/单元格/单元格字节上限，并沿同一候选优先级、Worker 校验和
`textStream` staging 路径透传到 `paste()` 与 `previewPaste()`；解析诊断只提供定位和
稳定错误码，不携带原始值。任一解析诊断仍使候选整批失败，Snapshot、Policy 和事务保持
不变；跨格式收集全部单元格错误以及 spill/流式事务仍未完成。

同日诊断聚合增量：若 internal、HTML 与纯文本候选都未通过有界解析，编辑器继续尝试全部
低优先级安全候选，并以 `all-candidates-failed` 返回最多 64 条冻结、值无关诊断；每条实际
候选诊断通过可选 `candidateFormat: 'internal' | 'html' | 'text'` 说明来源，超出上限以
`diagnostics-truncated` 明示。单候选失败保留原有诊断形状。畸形 `branch-tree` 内部候选不再
阻断单独提供的 HTML/纯文本回退；有效 branch envelope 仍按优先级独占处理。该增量不等同于
每个候选在首个语法错误之后继续扫描的完整单元格错误报告，spill/流式事务也仍未交付。

同日编辑增量校正：多范围 `Delete`/`Backspace`、DOM Portal 同列多范围
`Ctrl/Command+Enter`、treegrid 多范围 `Ctrl/Command+D` 和 `fillSeries()` 已支持单一
原子事务；多范围粘贴现在支持将同一份同尺寸输入矩形复制到多个不连续范围，并在
重叠映射、只读、Policy、Schema、代际或总单元格限额失败时整批拒绝；普通多范围复制仍
fail-closed。填充柄默认扩展多范围的活动范围并保留其余范围，前提是每个范围至少两行；
按住 `Alt` 时，活动范围至少两行、静态同伴至少三行即可在释放后以各自首两行推导
`fillSeries()` 并提交一个原子事务。它仍不提供相对引用、跨范围扩展和完整隐藏/筛选语义。

# 11. 智能匹配、校验与修复

## 11.1 规则分层

智能能力分为两类：

- Core 结构规则：唯一 ID、父节点存在、根集合一致、无环、字段 Schema 和安全限制。
- 可插拔业务规则：用量、损耗、单位、精度、替代料、有效期、企业编码和审批要求。

Core 禁止把业务规则伪装为通用结构规则。每条规则必须拥有稳定 `ruleId`、版本、严重度、适用条件、诊断结构和可选修复器。

业务校验器必须获宿主授予 `document:read` 后才可注册和执行；`schema:read` 是独立授权，未授予时校验器、修复器和命令贡献收到的 `schema` 必须为 `undefined`。插件只返回值无关 finding，宿主校验其可选回显的规则元数据后，签发完整 `ruleId`、`ruleVersion`、严重度和不可伪造的稳定 `issueId`。finding 必须引用当前请求范围内存在的实例和 Schema 字段路径；宿主按规则、实例、字段、消息键、参数和值摘要进行确定性排序。文档或插件安装代际在异步校验期间改变时，旧结果必须丢弃，不能覆盖当前诊断状态。

## 11.2 物料智能匹配

匹配引擎支持精确编码、前缀、别名、拼音、分词、编辑距离和规格字段组合，但区域算法与词典必须可注入。

每个候选必须返回总分、分项得分、命中原因、规范化过程和置信度。排序必须确定性；同分时使用公开稳定的次级规则。

自动选择资格只能在调用方配置的置信度和差值阈值同时满足时产生，并必须记录最终采纳或拒绝决策。低置信度或多候选接近时只给出建议，不得猜测写入；即使达到双阈值，匹配本身也绝不自动修改文档。

当前实现已提供纯 TypeScript 的 `matchBomMaterials()`，以及编辑器和组件门面的只读 `matchMaterials()`。内核覆盖编码精确匹配、前缀、宿主别名、宿主注入的拼音与分词、编辑距离，以及由显式 `specificationPaths` 标记的规格字段加权；结果返回规范化查询与候选、总分、分项得分、命中原因、置信度和稳定排序结果，同分按稳定 `occurrenceId` 次级规则排序。调用方提供 `selection.minConfidence` 与 `selection.minScoreDelta` 后，才会得到 `selected` 状态；该状态仅为建议，绝不修改文档或选区。

若宿主决定采用建议，必须显式调用 `proposeMaterialMatch()`，由编辑器签发冻结的 `BomMaterialMatchProposal`；应用层不得把候选对象、序列化 JSON 或自行拼装的数据当作可写入凭证。随后只有 `applyMaterialMatch()` 可以尝试提交，并在同一 FIFO 路径内复核提案归属、documentId、document generation、`baseRevision` 与候选有效性。可选 `matchApprovalPolicy` 已配置时必须先批准，拒绝、取消、过期或策略异常均不得产生部分写入。成功采纳只形成一个可 Undo/Redo 的原子事务；它是明确的宿主动作，而不是“自动选择”的副作用。每次提案、拒绝、过期或提交都通过 contracts/runtime 共用、值无关的 `materialMatchAudit` 输出关联提案 `baseRevision`、策略决策和事务，严禁输出查询、候选或字段原文。

编辑器匹配以调用开始时的 Snapshot revision 为绑定，在主线程按有界分片协作执行；支持 `AbortSignal`，以 `taskProgress` 的 `taskType: 'match'` 输出单调扫描进度，若文档在执行期间发生变更则以过期结果失败关闭。提案与应用使用相同的过期边界，匹配结果不会因采纳能力而变成隐式写入。当前尚未将匹配接入 Worker，业务规则插件、生产词典和带标注集的准确率/误修率/未匹配率验收仍属后续工作。

## 11.3 校验和自动修复

当前 F5 编辑器切片已提供只读 `validate()`：默认校验完整 Snapshot，亦可按当前可见投影或稳定选区范围校验；任务支持 `AbortSignal`，通过 `taskProgress` 以 `taskType: 'validate'` 报告单调进度，并返回带文档 revision、检查数量、稳定 `ruleId`/`issueId` 和值无关 `BomValidationIssue` 的冻结报告。Core 只重新检查索引结构和字段 Schema 规范化，业务规则由受授权的插件注入：注册校验器要求 `document:read`，`schema:read` 不会随文档读取隐式授予；宿主重签规则版本和严重度，拒绝伪造规则身份或无效 finding，并规范化排序和 ID。异步校验遇到 document 或插件代际变化返回过期结果且不发布旧报告。销毁或取消不会修改 Snapshot。

当前插件切片已将修复器输出限定为不可信的 `BomPluginFixDraft`，由编辑器宿主在捕获的 Snapshot 上以独立事务引擎干跑命令，生成冻结的正式 `BomPluginFixProposal`。正式提案包含宿主签发的插件归属、文档 generation/revision 绑定、精确影响范围（字段与结构节点）、修复前后 `BomSnapshotDiff` 及与当前活动提案的冲突信息；干跑不触发事务事件、不写入当前 Snapshot。该 Diff 的 `targetRevision` 仅标识隔离预览 Snapshot，提交后的权威 revision 必须取 `applyFix()` 返回的 `BomCommit`，并通过 proposalId 来源标记关联审计。提案是当前编辑器实例签发的能力对象，调用方必须保留 `proposeFix()` 返回的原对象，不能以 JSON 或对象展开重新构造后提交。

`applyFix()` 本身是显式批准动作：它在同一 FIFO 事务内重新校验提案归属、插件实例、`document:write` 授权、documentId、generation 和 revision，随后以单一可 Undo/Redo、带 `plugin:fix:<proposalId>` 来源标记的事务提交。默认拒绝重叠修复；宿主只有显式传入 `conflictResolution: 'supersede'` 才能使一个提案取代冲突中的活动提案。提交成功后编辑器自动重跑完整结构和已注册业务规则校验；复核等待不占用事务 FIFO，因此慢插件不能阻塞编辑、撤销或后续事务，且若期间状态变化会自动丢弃旧报告。持久化审计、跨进程审批和 Worker 级业务校验仍由宿主/DataSource 或后续 Worker 层负责。

- 支持循环、孤儿、非法层级、空用量、非法数值、缺失字段、精度异常和配置业务规则检测。
- 诊断必须包含规则 ID、行/列/字段、原因、严重度、原始值和建议。
- 自动修复默认只生成 `FixProposal`，包含置信度、影响范围和修复前后 Diff。
- 修复必须经用户确认或宿主显式策略批准，并形成单一、可撤销、可审计事务。
- 禁止在后台静默修改循环结构、数量、单位、物料身份或父子关系。
- 多个修复器修改同一字段时必须报告冲突并要求决策。
- 修复结果必须重新运行结构和相关业务规则，不得假定修复一定正确。

## 11.4 确定性与可观测性

相同规则版本、配置、词典和输入必须产生相同诊断及排序结果。涉及随机或近似算法时必须允许固定种子，并在结果中记录算法版本。

智能任务需报告索引版本、候选数、耗时、取消和过期丢弃情况，但禁止记录敏感字段原文。准确率、误修率和未匹配率必须通过带标注 fixture 验收，不能只测试响应时间。

当前匹配内核以 `BOM_MATCH_ALGORITHM_VERSION`、输入 Snapshot revision 和固定比较规则保证可复现的候选排序；编辑器结果公开 `algorithmVersion`、`indexRevision` 和 `totalCandidates`，并将 `match.duration`、`match.candidates` 写入脱敏诊断指标。`materialMatchAudit` 记录提案、策略决策、过期、拒绝或事务关联的值无关结果，可与宿主审计系统关联但不含业务原文。调用取消返回取消结果，revision 变化返回过期错误，二者均不提交匹配结果、更不改变 Snapshot。尚未完成 Worker 级任务遥测、业务规则诊断确定性和带标注集的质量指标验收。

# 12. 导入、导出与安全模型

## 12.1 导入流水线

```ts
export type BomImportSource = Blob | ArrayBuffer | ReadableStream<Uint8Array>;

export interface BomImportOptions {
  readonly format?: 'xlsx' | 'csv' | 'tsv' | 'xls';
  readonly mode: 'preview' | 'commit';
  readonly signal: AbortSignal;
  readonly baseRevision?: RevisionToken;
}

export interface BomImportReport {
  readonly taskId: string;
  readonly proposedPatch?: BomPatch;
  readonly commit?: BomCommit;
  readonly diagnostics: readonly BomError[];
}

export interface BomExportRequest {
  readonly mode: 'currentView' | 'completeData' | 'roundTripTemplate';
  readonly format: 'xlsx' | 'csv' | 'tsv';
  readonly rowScope: 'visible' | 'filtered' | 'all';
  readonly fieldIds: readonly string[];
  readonly csvFormulaProtection?: 'safe' | 'raw-exchange';
}

export interface BomExportDecision {
  readonly decisionId: string;
  readonly allowed: boolean;
  readonly fieldIds?: readonly string[];
  readonly maskingByFieldId?: Readonly<
    Record<string, 'omit' | 'redact' | 'hash'>
  >;
  readonly reasonCode?: string;
}

export interface BomExportPolicy {
  authorize(
    request: BomExportRequest,
    options: { readonly signal: AbortSignal }
  ): Promise<BomExportDecision>;
}

export interface BomExportOptions extends BomExportRequest {
  readonly signal: AbortSignal;
}

export interface BomExportResult {
  readonly taskId: string;
  readonly blob: Blob;
  readonly effectiveMode:
    | 'currentView'
    | 'completeData'
    | 'roundTripTemplate'
    | 'policyTransformed';
  readonly lossless: boolean;
  readonly policyDecisionId?: string;
  readonly exportedRowCount: number;
  readonly exportedFieldIds: readonly string[];
  readonly omittedFieldIds: readonly string[];
  readonly maskingSummary: Readonly<Record<string, 'redact' | 'hash'>>;
  readonly warnings: readonly BomError[];
}
```

每种导出都必须触发 `beforeExport`；提供 Policy 时每种模式都执行授权。完整数据导出必须由显式命令发起且强制经过 `BomExportPolicy.authorize()`，未配置 Policy 时返回 `E_EXPORT_AUTH_REQUIRED`。Policy 可以拒绝、裁剪字段或选择预定义脱敏策略；它只用于客户端防误泄漏，最终数据授权仍由宿主或服务端负责。成功和拒绝都产生不含字段原值的审计事件。

导入必须采用：

```text
文件识别 -> 限额检查 -> 分片读取/解压 -> 解析
  -> 字段映射 -> 类型转换 -> 结构校验
  -> 智能建议 -> Diff 预览 -> 原子提交
```

注意：XLSX 是 ZIP/XML 容器，文件分片读取不等同于全流程流式解析。解析器必须分别测量解压、共享字符串、工作表解析、规范化、Diff 和提交的耗时及峰值内存。

- 工作表、表头行、字段映射、层级来源、locale、空值和重复行策略必须可配置。
- 每个错误必须包含工作表、行、列、字段、规则 ID、原始值摘要和建议。
- 进度必须单调并包含当前阶段，所有长阶段必须支持取消。
- 取消、Worker 崩溃、超时或解析失败不得改变当前 BOM。
- 自动纠错和物料匹配默认生成建议，未经确认不得静默写入。
- 导入事务提交前必须再次校验 `baseRevision`，防止解析期间覆盖用户新编辑。

2026-08-08 当前 F5 受限纵向切片已接入编辑器与纯前端 Props/Outputs 门面：
`importData()` 接受有界 UTF-8 `Blob`、`ArrayBuffer` 或字节 `ReadableStream`，仅启用
CSV/TSV，支持 `preview`/`commit`、`AbortSignal`、默认资源上限和提交前 revision/代际
复核；预览复用现有类型转换与 Paste Policy，不改变 Snapshot，提交复用一个原子粘贴事务。
`exportData()` 支持当前/完整数据的 CSV/TSV 有界导出、`visible`/`filtered`/`all` 行范围、
safe/raw-exchange 公式保护和可选 `BomExportPolicy`；完整数据无 Policy 返回
`BOM_EDITOR_EXPORT_AUTH_REQUIRED`，裁剪或脱敏明确标记 `policyTransformed` 且不无损。
当前已增加受限 XLSX 纯数据工作表 ZIP/XML 读写、workbook/rels 工作表解析、显式工作表名选择、
独立 XLSX 安全限额、表头/稳定字段映射、值无关单元格诊断、预览 `proposedPatch` 和
`roundTripTemplate` 版本化 JSON 模板导出；解析拒绝公式、宏、外链、加密归档和安全限额之外的
输入，并复用现有原子事务管线。`beforeImport`/`beforeExport`/`exportCompleted`/
`exportRejected` 已在 browser runtime 提供强类型、值无关事件和同步取消。XLS/XLSX 复杂特性、
完整数据结构元数据、Worker/解压池、spill 事务和跨格式全量错误定位仍未完成，不能宣称第 12 章
导入导出验收完成。

2026-08-11 诊断增量：受限 XLSX 工作表解析现会把可定位的单元格级拒绝转换为冻结的、值无关
`sheetName`/`sourceRow`/`sourceColumn`/`code` 诊断，并沿 `importData()` 的预览与提交入口透传。当前覆盖
公式、非法共享字符串引用、错误单元格类型、单元格字节超限以及行、列、单元格数量超限；工作表
级 ZIP/XML、工作簿、关系、宏、外链和工作表选择错误仍通过顶层 `BomError.safeContext` 返回。
任何 XLSX 解析诊断都会使本次导入整体拒绝，不能把已经解析的有效单元格提交到 BOM；诊断不携带
原始单元格值。工作表进入映射、类型转换或结构校验后产生的单元格诊断也保留该 `sheetName`。
该增量仅在单个有界工作表内聚合可定位的单元格错误（最多 256 条）；跨格式全量
错误聚合、Worker/解压池或 spill/流式事务仍未完成。

## 12.2 支持格式与兼容边界

正式内置格式限定为：

- `xlsx`：支持兼容矩阵内的数据表子集。
- `csv`、`tsv`：支持可配置编码、分隔符和 locale。
- `xls`：仅通过可选适配器提供，不进入默认 Core 和性能承诺。

公式、宏、外部链接、图表、透视表、嵌入对象和复杂样式必须明确采用“拒绝、忽略、读取缓存值或保留文本”中的一种策略。前端禁止执行宏、公式脚本或外部链接。

“兼容 Excel/WPS”只表示已公布测试矩阵内、已定义数据子集和剪贴板场景的互操作，不得表述为兼容所有版本和全部功能。

## 12.3 Excel/WPS 互操作矩阵

每次发布必须固化客户端精确 build、OS、测试文件哈希和以下能力结果。等级含义沿用第 13.5 节，默认支持等级如下，具体 build 以当次发布矩阵为准：

| 客户端 | 平台 | XLSX 数据子集 | CSV/TSV | 剪贴板 | 明确限制 |
| --- | --- | --- | --- | --- | --- |
| Microsoft 365 Current Channel | Windows/macOS | A | A | A | 不执行宏、外链和嵌入对象 |
| Excel 2024 受支持补丁版本 | Windows/macOS | A | A | A | 公式按导入策略处理 |
| Excel for Web | 官方支持浏览器 | B | B | B | 浏览器剪贴板和下载能力限制 |
| WPS 当前及前一受支持桌面大版本 | Windows/macOS | A | A | A | 精确 build 单独固定 |
| WPS Web | 官方支持浏览器 | B | B | B | 浏览器能力与服务端转换限制 |
| 旧版 XLS 适配器 | 已公布环境 | B | 不适用 | 不适用 | 可选包，不保证样式保真 |

矩阵必须分别验证换行、空值、前导零、大整数、精确小数、日期系统、层级缩进、Unicode、隐藏列和复制粘贴。公式、宏、外链、合并单元格、图表、透视表、样式保真等限制必须逐项列出，不能只给一个总等级。

## 12.4 三种导出模式

- **当前视图导出**：遵循当前排序、筛选、显隐、列顺序和展示格式，适合展示与分享；行范围必须显式选择 `visible`、`filtered` 或 `all`，默认 `visible`。
- **完整数据导出**：保留稳定 ID、父子关系、排序键、字段类型、精度和隐藏业务字段，适合归档和系统交换。
- **可回导模板**：包含 Schema 版本、稳定字段标识、结构元数据和映射说明。

只有未裁剪、未脱敏且 `lossless === true` 的完整数据导出，重新导入后才必须满足结构、类型和规范值等价；展示格式允许随 locale 变化。任何 Policy 变换都必须把 `effectiveMode` 标记为 `policyTransformed`、`lossless` 标记为 false，并返回 decision ID、实际字段、遗漏字段和不含原值的脱敏摘要，不得继续标称“完整数据导出”。

部分 Snapshot 执行完整导出前必须通过 DataSource 原子加载完整文档，否则返回明确错误。可能造成字段丢失的模式必须显式标识，禁止把视图列权限当作数据安全边界。

## 12.5 不可信输入与资源限制

Excel、CSV、HTML、剪贴板、DataSource、自定义渲染内容和持久化数据均按不可信输入处理。

- 禁止 `eval`、动态脚本和未经清洗的 `innerHTML`。
- HTML 清洗采用白名单，URL 使用协议白名单。
- XLSX 把不可信文本写成明确的字符串单元格类型，禁止创建公式，且不修改规范值。
- CSV/TSV 的 `safe` 模式对去除前导空白后以 `= + - @` 开始的危险内容执行转义，并明确标注展示值不保证无损往返；`raw-exchange` 仅用于受信机器交换并保留规范值，必须由 Policy 显式批准。完整数据交换禁止使用不可逆改写冒充安全防御。
- 文件解析限制文件大小、解压后大小、工作表数、行列数、单元格长度、结构深度和总耗时。
- 必须防御 ZIP bomb、超长字符串、恶意共享字符串表和解析器拒绝服务。
- 写入对象前拒绝 `__proto__`、`prototype`、`constructor` 等原型污染键。
- 日志和指标默认不包含 BOM 内容、剪贴板原文或导入文件片段。

具体限额必须在配置 Schema 中提供安全默认值，并通过 `SECURITY_LIMIT` 错误返回，不得只依赖浏览器崩溃或内存不足作为保护。

## 12.6 CSP、隐私和供应链

- Worker 必须支持外部 `workerUrl`，不得强制依赖 `blob:` 或宽松 CSP。
- 接入文档必须提供最小 CSP 和 Trusted Types 配置示例。
- 默认不上传、遥测或持久化 BOM 内容；任何遥测都必须由宿主显式开启并脱敏。
- localStorage 和后端适配器必须尊重租户、用户和应用命名空间。
- 发布流程必须执行依赖漏洞扫描、许可证检查并生成 SBOM。
- Critical 漏洞禁止例外发布。High 漏洞只有在具备责任人、补偿措施、审批人和到期时间的风险接受记录后才可临时发布；到期后自动恢复阻断。

# 13. 无障碍、国际化、主题与平台兼容

## 13.1 Canvas 无障碍语义层

组件在所有受支持等级声明的功能范围内必须达到 WCAG 2.2 AA。Canvas 只负责视觉绘制，必须同步维护符合 WAI-ARIA Authoring Practices 的虚拟化 `treegrid` 语义层。宿主必须提供 treegrid 的可访问名称，并可以注入说明。

当前 F3/F5 渲染器通过 `renderer.labels.treegridLabel` 设置可访问名称；非空 `renderer.labels.treegridDescription` 会生成实例唯一、视觉隐藏的说明节点并以 `aria-describedby` 关联。空说明不生成节点或属性，销毁时节点随 renderer root 一并清理。

语义层必须按实际状态暴露：

- `aria-rowcount`、`aria-colcount`、`aria-rowindex`、`aria-colindex`。
- `aria-level`、`aria-expanded`、`aria-selected`、`aria-invalid`。
- 只读、必填、排序、编辑状态、错误描述和活动单元格。

treegrid 容器采用 `aria-activedescendant` 持有浏览焦点，活动单元格使用稳定 DOM ID。活动行滚出视口时必须保留轻量语义代理或先移动活动项，禁止让 `aria-activedescendant` 指向不存在元素。虚拟滚动与对象复用不得造成焦点丢失或读屏身份漂移；屏幕外未挂载行不能伪造为当前可交互元素，但必须正确报告总量和当前位置。

DOM Portal 编辑器打开时，焦点必须从 treegrid 移入真实输入控件；提交、取消或卸载时恢复到原活动单元格或最近有效代理。焦点返回、滚动定位和读屏播报必须属于同一状态转换。

2026-08-09 当前 F5 实现已在 renderer root（不在每帧替换的虚拟语义窗口中）维护独立的视觉隐藏 `polite`/`assertive` Live Region。`options.liveRegion.politeMinIntervalMs` 默认以 400ms 合并高频礼貌消息为最新一条；紧急消息立即投递，并在同一窗口内去重。`renderer.announce({ message, politeness })`、`editor.announce()` 和纯前端 Props/Outputs 门面同名方法只接收本地化纯文本，以 `textContent` 写入，拒绝 HTML、空消息和超长消息；调用方不得把原始 BOM 值带入读屏文本，除非宿主访问策略明确允许。编辑进入 `rejected` 时，renderer 使用 `labels.liveRegion.validationRejected` 或 `commitRejected` 在紧急区域播报不含草稿值、错误参数和安全上下文的固定消息，离开拒绝状态即清空该区域。指针拖动列宽或列位置仅在鼠标释放且对应宿主回调成功后，分别用 `labels.liveRegion.columnResizeCompleted` 或 `columnReorderCompleted` 进行不含列名、ID、宽度和排序值的礼貌播报；取消、无变化和回调失败保持静默。列位置拖拽预览在 `pendingOrder` 实际改变时使用 `labels.liveRegion.columnReorderTarget` 播报一基可见插入列序号，并以 `{position}` 占位符本地化；同一目标不会重复写入，仍受礼貌消息节流合并。树结构指针拖拽在目标位置变化时使用 `labels.liveRegion.treeMoveTarget` 播报 `before`/`after`/`inside` 的本地化位置，目标行同时带有无原值的 `data-bom-tree-drop-position` 和 `aria-description`；自身及后代目标不播报且不提交。编辑器在已挂载状态下仅于 `validationChanged` 诊断集合变化时，以 `validationCompleted` 或 `validationIssuesFound` 播报通过或 `{count}` 问题数，不得带入规则、行列地址、字段路径、问题文本或参数。键盘、行菜单和指针树移动仅在原子 `moveSubtree` 成功后使用 `treeMoveCompleted` 进行无值礼貌播报；自动回归已覆盖释放前不提交、目标语义和取消清理，NVDA/JAWS/VoiceOver 等人工读屏验收仍属于第 13 章发布门禁。

当前 F5 还实现值无关 `BomCanvasDiffView` 的非颜色 Diff 提示：行/单元格可有低饱和
Diff 填充，但同时绘制新增、删除、移动、顺序变化或方框等几何标记，禁止只靠颜色表达
状态。虚拟 treegrid 将本地化且不含原值的类别写入 `data-bom-diff-kind` 与
`aria-description`；行级差异标在 `row` 上以避免每个单元格重复播报，单元格级差异只标在
对应 `gridcell`，屏外活动单元格代理保持同一语义。此层按稳定地址绑定当前 Snapshot；
`deletedRows` 仍是带数量的非交互删除摘要并在语义 DOM 中使用 `role="note"`，不改变
treegrid 行计数。需要真实行位置时可使用 `ghostRows`：Ghost 行进入 Canvas、滚动高度、
行位置和语义 `aria-rowcount`/`aria-rowindex`，但以只读、不可选、不可编辑、不可展开和
非事务目标的属性暴露。Ghost 行不携带原值；完整键盘/读屏人工验收仍属于第 13 章发布门禁。

## 13.2 键盘、读屏和视觉要求

- 浏览、选择、编辑、展开折叠、列调整和树结构移动必须可仅用键盘完成。
- 拖拽必须提供键盘等价命令和目标位置播报。
- 后台校验、错误、拖拽目标和操作结果通过节制的 Live Region 播报。
- 错误、选中和 Diff 不得只依赖颜色；对比度和焦点标识满足 WCAG 2.2 AA。
- 支持 200% 浏览器缩放、系统高对比、`forced-colors` 和 `prefers-reduced-motion`。
- 在等效 320 CSS px 宽度和 400% 缩放下，工具栏、菜单、错误面板和配置界面必须 Reflow 且不遮挡关键操作；二维数据网格可保留双向滚动，但固定控件不得覆盖活动单元格。
- Hover 信息必须同时支持焦点和触摸；关键错误不得只存在于临时 Tooltip。
- 自定义 renderer 必须提供无障碍文本、状态和键盘行为，否则使用文本回退。

发布验收必须包含自动扫描，以及 NVDA+Chrome/Edge、JAWS+Edge、VoiceOver+Safari 的桌面人工任务测试。B/C 级移动端声明支持的功能还必须通过 iPad/iPhone VoiceOver 和 Android TalkBack 人工任务；自动扫描不得替代人工验收。

## 13.3 国际化与本地化

- 所有 UI、错误、状态、快捷键名称和读屏文本由可注入语言包提供，Core 禁止硬编码用户可见文案。
- 支持运行时切换 locale，且不得丢失数据、选区、历史或编辑草稿。
- 数字、日期、百分比、单位、排序和大小写比较使用 Intl 或等价标准能力；内部始终保留无损规范值。
- 数值输入明确小数点、千分位、负数和空值规则；失败时保留草稿，禁止猜测转换。
- 支持 Unicode 规范化、组合字符、Emoji、全角半角和双向文本；原始物料编码不得被静默改写。
- 支持 RTL 及中英阿混排，冻结侧、左右键、滚动和 Canvas 测量必须正确翻转。
- 拼音、别名和区域分词是 locale 插件，不进入通用 Core 固定规则。
- 文本测量、排序和搜索缓存键必须包含 locale、字体、字号、方向和规范化策略。

## 13.4 主题和设计令牌

视觉样式必须通过稳定设计令牌配置，至少包含字体、字号、行高、颜色、边框、焦点、选区、错误、Diff 和密度。主题切换不得修改领域状态，必须触发可控重绘并保持焦点和视口锚点。

插件和自定义 renderer 禁止读取未公开 CSS 内部类名，应使用主题上下文。高对比和减少动效不是可选主题，而是必须支持的系统偏好。

## 13.5 默认兼容等级

兼容等级：A级为完整功能与全部发布门禁，B 级为核心查看编辑并列出限制，C 级为查看和简单字段编辑，不支持环境必须在初始化时返回明确结果。

| 环境 | 默认等级 | 支持范围 |
| --- | --- | --- |
| Windows/macOS Chrome、Edge 当前及前一稳定大版本 | A | 完整支持 |
| Windows/macOS Firefox 当前稳定版及当前 ESR | A | 完整支持，剪贴板按能力回退 |
| Ubuntu 当前 LTS Chrome 当前及前一稳定版、Firefox 当前版及 ESR | A | 完整支持，桌面集成按 Linux 能力矩阵 |
| Safari 当前及前一稳定大版本，运行于该版本官方支持的 macOS | A | 完整支持，剪贴板按能力回退 |
| Evergreen WebView2 | A | 宿主使用支持的 Chromium 并正确配置 Worker/CSP |
| Electron | B | 仅支持与 A 级 Chromium 等价的内核，宿主集成单独验收 |
| iPadOS Safari 当前及前一大版本 | B | 查看、选择、基础编辑；复杂拖拽和桌面快捷键不作等价承诺 |
| iOS/Android 手机浏览器 | C | 查看和简单编辑，不执行 10 万行桌面性能门禁 |
| IE、EdgeHTML、非 Evergreen WebView | 不支持 | 不提供兼容补丁 |

正式发布必须用精确版本矩阵覆盖上述滚动窗口，不能只写“最新版”。键盘测试覆盖 Windows、macOS、Linux、中日韩 IME、死键、AltGraph 和不同布局。

兼容矩阵还必须固定 Vue、React、TypeScript、Node 构建环境、主流 bundler 和 UMD 加载方式的版本范围。框架版本变化不得只依靠类型检查，必须运行适配器契约和真实挂载测试。

A 级表示功能、正确性、无障碍和稳定性全部进入发布门禁；第 1 章的绝对性能数字只应用于锁定的参考 runner。其他 A 级浏览器必须建立各自批准基线并执行回退门禁，不得用不同硬件的单次耗时直接互相比较。

## 13.6 渐进式降级

低能力设备可以降低 DPR、overscan、动画、实时模糊检索频率和 Worker 并发数。字体失败、Canvas context 丢失、Worker 不可用、Clipboard 权限拒绝和存储额度不足必须提供恢复或明确降级路径。

降级行为必须通过 `capabilities` 和一次结构化事件通知宿主，不得静默改变数据语义。任何降级都不能关闭结构校验、事务原子性、XSS 清洗或公式注入防御。

# 14. 可观测性、故障恢复与质量门禁

## 14.1 诊断与指标

Core 必须提供 `getDiagnostics()`、`on('metric')` 和可注入 logger，至少观测：

- 初始化、规范化、索引构建、可见投影和 interactive-ready。
- 帧耗时分位数、dirty rect 数量、整层重绘次数和 Long Task。
- Worker 排队、运行、取消、过期丢弃、崩溃和重建。
- 各缓存条目数、估算字节数、命中率和淘汰数。
- 事务提交、拒绝、冲突、Undo/Redo 和历史占用。
- 搜索候选数、各阶段耗时和索引版本。
- 导入导出阶段、吞吐、峰值临时内存估算和取消延迟。

指标必须携带实例 ID、版本和必要环境信息，不得携带单元格原值。遥测默认关闭；启用遥测由宿主决定，logger 异常不得影响编辑器。

## 14.2 故障恢复

必须定义并测试以下故障：

- Worker 崩溃、消息协议不匹配、任务超时和过期结果。
- Canvas context 丢失、字体加载失败和容器尺寸为零。
- localStorage 额度不足、模板损坏和迁移失败。
- Clipboard 权限拒绝和非安全上下文。
- 导入解析失败、资源限额触发、用户取消和提交前 revision 冲突。
- 插件初始化、绘制、校验和卸载异常。
- 组件销毁时仍有编辑草稿或未完成任务。

任何故障都不得产生半提交文档。可恢复故障必须给出重试或降级路径；不可恢复故障必须冻结写操作、保留最后一个有效 Snapshot 并返回稳定错误码。

## 14.3 自动化测试矩阵

- Core 单元测试行覆盖率不低于 90%，分支覆盖率不低于 85%。
- 事务、索引、Diff、Undo/Redo 和树不变量模块分支覆盖率不低于 95%。
- 树结构、事务和 Diff 必须执行属性测试、状态机模型对照和模糊测试。
- 覆盖空树、深树、宽树、重复 ID、孤儿、循环、乱序、非法类型、极长字符串和最大资源边界。
- Vue、React、UMD 共享适配器契约测试，覆盖重复挂载、卸载、KeepAlive 和多实例焦点切换。
- E2E 覆盖键盘、IME、剪贴板、拖拽、导入导出、Undo/Redo、权限、异步校验和错误恢复。
- 视觉测试覆盖 DPR、缩放、字体、RTL、高对比、深浅主题和 context 恢复；Canvas 像素与语义 DOM 分别断言。
- 安全测试覆盖恶意 HTML、公式注入、异常 XLSX、ZIP bomb、原型污染、严格 CSP、超限输入，以及通过内部剪贴板、文件导出和插件命令绕过数据外发 Policy 的尝试。
- 协议测试必须覆盖旧版 Schema/Patch/模板 fixture 升级、迁移幂等、迁移失败不覆盖、未知新主版本拒绝、兼容次版本能力协商、Worker 握手不匹配、远程订阅断线补偿和 resync。
- 无障碍测试包含自动扫描和指定读屏器人工任务。
- 性能测试在固定 runner 执行第 1 章全部场景。

## 14.4 稳定性与故障注入

必须执行不少于 2 小时的脚本化连续编辑，期间重复滚动、展开折叠、编辑、粘贴、搜索、Undo/Redo、模板切换和实例创建销毁。

预热后按第 1.4 节的静默、GC、空闲噪声和均匀采样口径测量；留存堆增长不得高于 `max(20MiB, 稳态基线的 5%)`，2 小时趋势回归的 95% 置信上界也必须达标。Worker、监听器、定时器、DOM 节点和插件注册数量不得持续增长。

故障注入必须覆盖 Worker 崩溃、异步超时、存储失败、剪贴板拒绝、Canvas context 丢失、插件抛错和导入取消，并验证规范 Snapshot 哈希没有意外变化。

## 14.5 发布阻断规则

以下任一失败均禁止发布正式版本：

- 结构不变量、事务原子性或 Undo 确定性失败。
- 公开 API、事件、错误码或适配器契约未声明变化。
- A 级浏览器关键路径失败，或 A/B/C 任一等级在其声明支持范围内的无障碍人工任务失败。
- 安全扫描存在任何 Critical，或存在没有有效风险接受记录的 High 风险。
- 固定 runner 性能超过硬门槛或未批准回退阈值。
- 长时间稳定性存在可重复泄漏或销毁残留。
- Schema、Patch、模板、插件或 Worker 协议升级没有迁移/兼容方案。
- “空白帧为 0”缺少完整认证证据：只有全部权威 presented frame 均完成独立相关、相关产物 `qualified === true` 且帧数与认证 trace 完全一致时才允许判定；缺失或重复 marker、轨迹/覆盖不完整、trace 未认证、时钟映射失败、帧无法关联、Schema 不匹配或 readback 缺失时，必须输出 `unqualified`、`passed: null`、`blankFrameCount: null` 并归档已有原始证据，禁止以 0、空数组或 RAF 估算值代填。

# 15. Mock Demo 与自动验收入口

Demo 不是营销页面，而是功能和质量的最终验收入口。必须包含：

## 15.1 数据与性能

- 一键加载固定种子的 10K/100K 六级和 100K 扁平 fixture。
- 展示生产构建哈希、浏览器、设备能力、Worker 配置和当前降级状态。
- 自动执行首屏、滚动、搜索、展开折叠、单行更新和内存场景。
- 显示 P50/P95、Long Task、帧耗时、内存估算和通过/失败状态；只有启动类达到 200 个样本、交互类达到 1000 个事件时才显示 P99，否则显示 `N/A: insufficient samples`。
- 导出包含环境、fixture/构建哈希、原始测量值、原始 compositor trace、应用像素证据、独立相关产物、Schema/profile/协议版本、全部容差和结构化 blocker 的 JSON 报告；manifest 必须覆盖所有已归档产物。

## 15.2 功能演示

- 列顺序、宽度、显隐、冻结、多级表头和模板保存切换。
- 精确/前缀/模糊物料匹配、校验诊断、修复建议和 Diff 预览。
- Excel/WPS 剪贴板往返、快捷键修改/冲突诊断/重置。
- 层级拖拽及键盘移动、结构变更、Undo/Redo 和批量事务。
- 三种导出模式、XLSX/CSV 导入、进度、取消和错误报告。
- 多实例焦点隔离、共享 Worker 公平性和实例销毁。
- locale、RTL、主题、高对比、缩放和读屏语义检查入口。

## 15.3 正确性断言

Demo 的每个自动场景必须在操作后运行结构不变量检查。Undo 后必须与操作前规范 Snapshot 哈希相同；导出回导必须验证结构、类型和规范值等价。

Demo 不得用更宽松的内部 API 绕过公开 SDK。Vue、React 和原生 Demo 必须共享相同 fixture 和核心验收脚本。

# 16. 版本、兼容与演进治理

## 16.1 版本策略

- 所有公开包遵循 SemVer；Core、Vue、React 和 UMD 适配包使用锁步版本并发布兼容矩阵。
- Document Schema、Patch、视图模板、插件 ABI 和 Worker 协议必须拥有独立版本字段。
- 每个版本化协议必须公布当前版本、可读取版本范围和可写出版本；握手遇到未知主版本必须拒绝，兼容次版本必须通过 capabilities 协商，未知必需字段或能力不得静默忽略。
- 持久化格式升级必须使用纯函数、确定性迁移器；迁移失败禁止覆盖原数据。
- 跨主版本降级默认不支持，必须给出明确错误。
- 公共类型、公开子路径、错误码、事件名和载荷属于兼容性承诺。
- 实验能力放入 `experimental` 出口，不得被适配器默认暴露。

## 16.2 废弃与迁移

API 废弃应至少保留两个次版本，并在开发模式给出一次性警告、迁移文档和替代 API。删除或改变语义只能发生在主版本。

每次发布必须包含 Changelog、API 差异、迁移指南、包兼容矩阵、协议版本、性能回归结果、已知限制和第三方依赖清单。

CI 必须阻止未声明公共 API 变化、Schema 无迁移升级、适配器契约偏差、包体积超限和未批准的性能回退。

## 16.3 架构治理

白皮书必须记录版本、状态、责任人和变更历史。架构红线、兼容等级、性能 fixture 或 SLO 的变化必须通过 ADR 说明动机、证据、影响和迁移方案。

“终版”“不可改变”不得阻止基于证据的演进；稳定的是变更流程和兼容承诺，而不是某个未经验证的实现细节。

# 17. 最终交付物

- `@qkplm/bom-editor`：统一稳定入口及完整 TypeScript 类型。
- `@qkplm/bom-editor/contracts`、`model`、`transaction`、`datasource`、`plugin-api/headless`、`plugin-api/browser` 等稳定子路径。
- `@qkplm/bom-editor-vue`：Vue 3 薄适配器。
- `@qkplm/bom-editor-react`：React 薄适配器。
- `@qkplm/bom-editor-umd`：原生 HTML/UMD 构建。
- Worker Runtime 与外部 Worker 部署文件。
- 可选 XLSX/XLS 导入适配模块及格式兼容矩阵。
- 完整 Mock Demo 和自动验收工程。
- 版本化 benchmark fixture、脚本、环境描述和基线报告。
- 标准 API、事件、错误码、插件、DataSource、CSP、无障碍和接入文档。
- SemVer Changelog、迁移指南、ADR、SBOM 和许可证清单。
- 本白皮书及其变更记录。

# 18. 证据化技术优势

在满足本白皮书全部发布门禁并公开对应报告后，产品优势可以表述为：

1. 稳定身份、多维索引、可见投影与增量计算共同支撑大规模树形编辑。
2. 分层失效 Canvas、双向虚拟化和帧预算调度提供可量化的滚动与输入稳定性。
3. 原子事务、版本化 Patch、结构 Diff 和确定性 Undo/Redo 提供工业数据正确性。
4. 状态化快捷键、IME 隔离、DOM 编辑层和 ARIA treegrid 提供完整输入与无障碍路径。
5. 可解释的检索、校验和修复建议在不绑定企业规则的前提下提供智能能力。
6. 稳定 API、插件 ABI、DataSource 和薄框架适配器支持跨平台复用。
7. 安全限额、故障恢复、可观测性和自动发布门禁使能力可商用、可回归、可演进。

这些优势必须以基准报告、兼容矩阵和测试结果为依据，不使用无法证实的“唯一”“不可复刻”或“全面碾压”等结论。

# 19. 文档变更记录

| 版本 | 状态 | 变更摘要 |
| --- | --- | --- |
| v2.0-r12 | 实现同步 | 行号区域的树节点拖拽在上下视口边缘自动滚动，越过虚拟行窗口仍持续提供稳定 ID 的 `before`/`after` 预览；滚动不提交，释放后才输出一次 `moveSubtree` |
| v2.0-r13 | 实现同步 | 列头边界双击/右键菜单按当前渲染窗口自动适应列宽；多范围 `Alt` 填充柄在活动范围至少两行、静态同伴至少三行时复用 `fillSeries()` 原子事务 |
| v2.0-r14 | 实现同步 | 增加稳定 occurrenceId 行高覆盖、行号菜单行高操作、列头恢复默认列宽；视图输出与交互 Undo/Redo 闭环，查询/结构刷新不丢失不可见行覆盖 |
| v2.0-r11 | 实现同步 | 单一可见矩形按住 `Alt` 开始右下角填充柄拖拽时复用既有数值/ISO 时间 `fillSeries()` 原子事务；默认复制填充和多范围序列失败关闭边界保持不变 |
| v2.0-r10 | 实现同步 | 增加内部、HTML、纯文本候选的有界失败诊断聚合；多候选全失败时输出带来源 `candidateFormat` 的值无关定位，畸形 branch-tree 可安全降级到单独提供的低优先级表示，仍不宣称完整流式错误报告 |
| v2.0-r9 | 实现同步 | 补齐多范围粘贴和活动范围填充柄：同一份同尺寸输入矩形可在多个不连续范围内以单一原子事务提交；填充柄保留其余范围并复用同一填充事务；重叠源坐标、只读、Policy、Schema、代际和目标单元格限额失败时整批拒绝，普通多范围复制与序列/相对引用填充仍保留限制 |
| v2.0-r8 | 产品化基线 | 增加 v1.0 产品合同：明确目标角色、任务闭环、SDK/配置/任务/接入产品面、非目标、Preview/Beta/GA 声明边界，以及以公开 API 示例和错误恢复路径验收产品完成度 |
| v2.0-r2 | 规范澄清 | 增加值无关 Canvas Diff 视图协议、文档/代际/revision 绑定、组件 `onDocumentReplaced` 输出、受控更新顺序与非颜色 ARIA 语义；删除行 ghost projection 仍未纳入当前实现 |
| v2.0-r3 | 实现同步 | 补充稳定 ID 指针树结构拖拽目标、before/after/inside 预览与 ARIA/Live Region 语义；释放后复用原子 `moveSubtree` 事务并纳入 Undo/Redo；保留多选、跨未加载边界和人工读屏验收限制 |
| v2.0-r4 | 实现同步 | 增加值无关 `deletedRows` 删除摘要：按稳定 ID 与当前行边界绘制非交互提示并以 `role="note"` 暴露；不伪造可访问行 |
| v2.0-r5 | 实现同步 | 增加已选行号拖拽的有序 `occurrenceIds` 请求和单一批量 `moveSubtree` 事务；拒绝重复 ID、祖先/后代重叠与目标循环，保留跨未加载边界限制 |
| v2.0-r6 | 实现同步 | 完成受控 `ghostRows` 删除行投影：支持 `start/before/after/end` 锚点和可选层级，纳入 Canvas、滚动高度、行位置及 ARIA 行计数；明确只读、不可选/编辑/展开和非事务目标，并补充 renderer/editor 回归测试 |
| v2.0-r7 | 实现同步 | 为部分 Snapshot 的键盘/指针结构移动增加 `bom-structure-move-request/v1` 受控 Props/Outputs 请求；冻结并绑定 documentGeneration、base/source revision 与稳定 ID，宿主通过 `update({ document })` 回显完整结构；补充 editor/component 回归测试，保留本地跨未加载事务限制 |
| v2.0-r1 | 规范澄清 | 补充 Undo/Redo 程序化入口；分离可序列化中立事件 envelope 与 browser runtime 同步可取消包装 |
| v2.0 | 规范基线 | 补充数据模型、复杂度、API、事务、Worker、无障碍、安全、基准、测试和版本治理；纠正不可验收的绝对承诺 |

> 注：本白皮书定义目标架构和验收边界。具体实现选择必须通过测试、基准和 ADR 证明符合本文契约。
