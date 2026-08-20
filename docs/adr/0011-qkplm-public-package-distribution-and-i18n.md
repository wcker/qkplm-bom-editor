# ADR-0011：QKPLM 公开包分发与首发中英国际化

- 状态：已接受
- 日期：2026-08-20
- 决策范围：公开 npm 分发身份、发布工程，以及首发运行时 `zh-CN`/`en-US` 界面语言能力。
- 规范依据：[v2 白皮书](../../现代化高性能可复用BOM编辑器组件.md) 第 0.5、2.2、8.6、13、14、17 章
- 相关需求：[REQ-13-005](../需求追踪矩阵.md#req-13-005)、[REQ-13-006](../需求追踪矩阵.md#req-13-006)、[REQ-15-002](../需求追踪矩阵.md#req-15-002)
- 执行基线：[npm 发布与国际化实施基线](../npm发布与国际化实施基线.md)

## 上下文

现有工作区由多个 `@bom-editor/*` 物理包组成。已确认的发布边界只承诺 Core、React、Vue 与传统
脚本四个入口，并使用 QKPLM 作为唯一公开 npm 品牌；内部实现不得形成公开兼容性承诺。

当前实现提供 `locale`、`labels` 和 `configurePresentation()` 的局部呈现配置，默认菜单仍包含硬编码
或宿主注入的简体中文文案。首发公开组件需要默认中文并能完整切换英文，不能把不完整菜单翻译作为
稳定 API 发布。

## 决策

1. 外部稳定 npm 包名为 `@qkplm/bom-editor`、`@qkplm/bom-editor-react`、
   `@qkplm/bom-editor-vue` 和 `@qkplm/bom-editor-umd`。它们替代此前的公开消费名称。
2. `@bom-editor/*` 仅保留为仓库内部物理包标识，并全部设为 `private: true`。公开 Core 构建时封装
   内部实现；公开适配器只声明公开 Core 依赖；公开 UMD 为完全自包含构建。
3. 首发 RC 实现完整运行时 `zh-CN`/`en-US` 国际化：组件自有 UI 文案、语言包、语言切换 API、
   双语自定义命令标签和相关测试均在范围内。该决策不授权 RTL、新主题、额外框架能力或业务数据翻译。
4. 组件默认 `zh-CN`，宿主通过稳定呈现 API 在运行时切换 locale。切换不得修改 Snapshot、revision、
   事务/历史、选区、草稿、视口、挂载代际或 DataSource 状态。首发语言包随 Core 同步内置，禁止
   通过网络加载。
5. 新公开 API、构建产物和发布门禁以执行基线的 `PUB-*`、`REL-*`、`CICD-*` 与 `I18N-*` ID 为准。
   本 ADR 不把当前 F3 性能、内存、WCAG/读屏或 soak 证据标记为通过。

## 后果

- 所有公开文档、Demo、包元数据、API 基线、安装 smoke 和发布工作流必须使用 `@qkplm/*`。
- 公开 Core 从透明重导出 facade 转为自包含分发构建，受支持导出不得泄露 `@bom-editor/*` 运行时路径。
- React/Vue 只依赖 `@qkplm/bom-editor`；peer dependency 范围分别为 `^18.0.0 || ^19.0.0` 与 `^3.3.0`。
- UMD 必须同时产出 ESM、可直接脚本使用的 UMD、source map 和 SRI，并经严格 CSP smoke 验证。
- 自定义菜单和命令使用静态 `LocalizedText`；缺少英文时回退中文；渲染路径不执行宿主翻译回调。

## 被否决方案

### 继续公开所有 `@bom-editor/*` 物理包

否决原因：会把当前实现分层永久固化为外部 API，增加版本协调和破坏性迁移成本。

### 仅重命名包，不构建自包含 Core

否决原因：发布后会保留指向未发布内部包的依赖，消费者无法安装或会被迫依赖内部模块结构。

### 仅以 `labels` 注入菜单中文/英文

否决原因：无法保证全部操作、ARIA 与错误文案覆盖，也无法使自定义命令获得稳定回退与测试语义。

### 在组件中内置全局语言按钮

否决原因：嵌入式 SDK 不应与宿主应用的语言设置竞争；组件提供受控 API，语言选择控件由宿主放置。

### 将完整 i18n 推迟至 RC 之后

否决原因：locale 已属于公开呈现接口；首发不完整文案会形成难以兼容修复的公开缺口。

## 验证方式

1. `release:verify` 仅允许四个 `@qkplm/*` tarball，且不包含 `@bom-editor/*` runtime dependency。
2. 空目录 tarball smoke 验证 Core、React、Vue 和 UMD；UMD 在无 bundler 的 HTML 与严格 CSP 下加载。
3. API 报告和负向导入测试验证公开出口不允许内部路径。
4. 自动 i18n smoke 覆盖 `zh-CN -> en-US -> zh-CN`：菜单、操作、编辑提示、ARIA/live region、
   自定义 `LocalizedText`、业务文本不变和所有状态不变量。
5. RC 和正式版分别满足执行基线第 6 节门禁；F3 正式资格未通过前不得发布 `latest`。
