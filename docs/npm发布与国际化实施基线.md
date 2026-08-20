# npm 发布与国际化实施基线

> 状态：`IMPLEMENTATION_VERIFIED`（本地工程与自动验证已完成；远端发布控制和实际发包未完成）  
> 生效日期：2026-08-20  
> 适用范围：QKPLM BOM Editor 的公开 npm 包、发布工程、公开文档及组件运行时界面文案。  
> 上位文档：[现代化高性能可复用 BOM 编辑器组件](../现代化高性能可复用BOM编辑器组件.md)、[ADR-0011](./adr/0011-qkplm-public-package-distribution-and-i18n.md)、[研发落地实施计划](./研发落地实施计划.md)、[需求追踪矩阵](./需求追踪矩阵.md)。

本文件是已确认发布配置的唯一执行基线。本地实现已由相应命令验证为
`IMPLEMENTATION_VERIFIED`；它不证明 F3 性能、人工可访问性、远端供应链控制或实际 npm 发布已经
通过，更不构成 `PRODUCTION_CERTIFIED`。

## 1. 边界与不变量

| ID | 已确认配置 | 约束 | 验证方式 | 实现状态 |
| --- | --- | --- | --- | --- |
| PUB-001 | 首发只公开四个 npm 包 | 不将内部物理包作为独立公共 API 发布 | `release:verify` 检查 package allowlist 和 tarball | 已本地验证 |
| PUB-002 | 内部包永不发布 | `contracts`、`model`、`transaction`、`datasource`、`runtime`、`renderer-canvas`、`visible-projection`、`worker`、`editor` 均为 `private: true` | `pnpm pack --dry-run` 与 package metadata 检查 | 已本地验证 |
| PUB-003 | 对外 Core 自包含 | 公开 Core 构建时封装内部实现；消费者不得解析内部工作区依赖 | 空目录安装并仅导入公开包 | 已本地验证 |
| PUB-004 | 框架适配器依赖公开 Core | React/Vue 不得依赖或导入内部包；React/Vue 本身为 peer dependency | tarball dependency graph 和框架 smoke | 已本地验证 |
| PUB-005 | UMD 完全自包含 | UMD 不保留 npm 裸模块导入；可直接由传统 `script` 使用 | 纯 HTML/严格 CSP 浏览器 smoke | 已本地验证 |
| PUB-006 | 公开导出即稳定承诺 | 四包根出口及允许的子路径均受 SemVer/API 基线约束；禁止深层导入 | API 报告、出口检查、负向导入测试 | 已本地验证 |
| PUB-007 | 首发无公开 experimental API | 未稳定能力留在私有包，不通过未文档化子路径暴露 | API 基线审查 | 已本地验证 |

## 2. 公开包与 npm 元数据

### 2.1 公开包 allowlist

| 包 | 用途 | 首发构建形态 | npm 依赖策略 |
| --- | --- | --- | --- |
| `@qkplm/bom-editor` | 浏览器 ESM Core SDK | 自包含 ESM、类型声明、source map | 不依赖任何 QKPLM 内部 npm 包 |
| `@qkplm/bom-editor-react` | React 生命周期桥接 | ESM、类型声明、source map | 依赖公开 Core；`react` 是 peer dependency |
| `@qkplm/bom-editor-vue` | Vue 生命周期桥接 | ESM、类型声明、source map | 依赖公开 Core；`vue` 是 peer dependency |
| `@qkplm/bom-editor-umd` | 原生脚本/传统全局入口 | ESM 入口、UMD 普通版、UMD 压缩版、类型声明、source map | UMD 为完全自包含 bundle |

所有公开包必须统一包含 `dist/`、包级 `README.md`、`LICENSE`，并只由白名单构建产物组成。
根工作区 `aibom-editor-workspace` 保持 `private: true`，永不发布。

### 2.2 固定元数据

| 项 | 值 |
| --- | --- |
| npm scope | `@qkplm` |
| 发布 registry | `https://registry.npmjs.org` |
| scoped package 访问级别 | `public` |
| 版权主体 | `QKPLM` |
| 开源许可证 | `Apache-2.0` |
| 源码仓库 | `https://github.com/wcker/qkplm-bom-editor` |
| npm `repository` | Git 仓库 URL，带正确的 `directory` 子路径 |
| npm `homepage` | `https://github.com/wcker/qkplm-bom-editor` |
| npm `bugs.url` | `https://github.com/wcker/qkplm-bom-editor/issues` |
| 普通支持入口 | GitHub Issues；单人维护，不承诺 SLA |
| 安全漏洞入口 | GitHub Private Vulnerability Reporting；`SECURITY.md` 不引导公开 issue 披露 |
| 遥测与网络 | SDK 默认零遥测、零主动网络请求；不得上传 BOM、剪贴板、错误或业务数据 |

每个公开包必须有 `license`、`repository`、`homepage`、`bugs`、`keywords` 和准确描述。根目录放置
Apache-2.0 正文；所有公开 tarball 必须包含同一许可证文本，必要时带 `NOTICE`。

## 3. 版本、兼容性与处置规则

| ID | 已确认配置 | 规则 |
| --- | --- | --- |
| REL-001 | 首个候选版本 | `1.0.0-rc.1`，npm dist-tag 为 `next` |
| REL-002 | 正式版本 | F3 正式门禁完成后发布 `1.0.0`，npm dist-tag 为 `latest` |
| REL-003 | 锁步发版 | 四个公开包始终使用同一版本、同一 Release tag 和同一 changelog 条目 |
| REL-004 | 版本语义 | 遵守 SemVer：破坏性变更 major，新增能力 minor，修复 patch |
| REL-005 | 版本工具 | 使用 Changesets 管理版本、包间依赖和 `CHANGELOG.md` |
| REL-006 | 已发布版本不可覆盖 | 仅允许 `deprecate`、移除 dist-tag、安全公告和新的修复版本；不得重发同版本 |
| REL-007 | 破坏性变更 | 必须有 API 基线更新、major 版本、迁移指南和 GitHub Release Notes |

首发支持范围如下：

| 类别 | 承诺范围 |
| --- | --- |
| Node.js | `>=22`，用于构建和 SSR 导入 |
| 浏览器 | Chrome、Edge、Firefox、Safari 最近两个大版本 |
| React peer dependency | `^18.0.0 || ^19.0.0` |
| Vue peer dependency | `^3.3.0` |
| 模块格式 | ESM；不支持 CommonJS |
| UMD | 现代浏览器；不支持 Internet Explorer |

框架的新主版本只能在 CI 验证后扩大 peer dependency 范围。公开包不得在 Node/SSR 导入时读取
浏览器全局对象。

## 4. 构建、产物与 CDN

### 4.1 构建规则

1. CI 固定 Node `22.x` 与 pnpm `11.8.0`，使用 `pnpm install --frozen-lockfile`。
2. 发布包必须由同一次干净 CI 构建产生；禁止使用本机未提交代码、分支临时提交或手工上传 tarball。
3. 每个发布包执行 `prepack` 或等价的发布前验证，保证 `dist`、声明、README、LICENSE 和导出表一致。
4. 每个最终 tarball 必须在独立空项目中安装、导入和运行 smoke，禁止只在 monorepo 链接环境中验证。
5. `exports` 是唯一受支持导入边界；保持精确 `types` 映射和 source map。`sideEffects: false` 仅可用于确实无导入副作用的包。

### 4.2 浏览器产物

`@qkplm/bom-editor-umd` 必须产出：

```text
dist/index.js
dist/index.d.ts
dist/bom-editor.umd.js
dist/bom-editor.umd.min.js
dist/*.map
dist/integrity.json
```

- UMD 全局名为 `QkplmBomEditor`。
- `bom-editor.umd.min.js` 生成 SHA-384 SRI；`integrity.json` 与 GitHub Release 附件保存对应值。
- README 支持 jsDelivr 与 unpkg 的精确版本 URL，例如 `@1.0.0`；生产示例不得使用浮动 `@latest`。
- UMD、Core、React、Vue 的 gzip 体积记录在 CI 报告。默认预算分别为 `250 KB`、`30 KB`、`30 KB`、`300 KB`，只告警，不阻断发布。

## 5. 自动发布与仓库控制

| ID | 已确认配置 | 规则 | 验证/证据 |
| --- | --- | --- | --- |
| CICD-001 | 发布触发 | 仅 GitHub Release 的 `v*` tag 触发 | 工作流校验 tag 格式及 GitHub Release 事件 |
| CICD-002 | 发布源码 | tag 必须指向默认分支已合并提交 | GitHub API/merge-base 校验 |
| CICD-003 | 发包身份 | GitHub Actions npm Trusted Publishing（OIDC）与 npm provenance | `id-token: write`、npm provenance 记录 |
| CICD-004 | 组织管理 | `@qkplm` 由单一 Owner 管理；账号启用 2FA 并保存恢复码或硬件密钥 | npm 组织设置人工检查 |
| CICD-005 | 分支保护 | 默认分支仅由 PR 合并；要求 CI 成功；单人维护不要求第二人审批 | GitHub ruleset |
| CICD-006 | CI 禁止绕过 | 不使用长期 `NPM_TOKEN`，不允许手工 npm publish | 工作流权限与发布策略审查 |

Release 工作流根据版本是否包含预发布标识自动选择 `next` 或 `latest`。发布完成后附带
GitHub Release Notes、Changesets 生成的 changelog、tarball 校验信息、SBOM 和 SRI 清单。

## 6. 质量、供应链与发布门禁

### 6.1 RC 门禁

`1.0.0-rc.*` 至少必须通过：

1. `pnpm install --frozen-lockfile`、类型检查、现有测试、构建、API 基线与文档检查。
2. 四个最终 tarball 的独立安装 smoke：Core ESM、React、Vue、UMD 纯 HTML。
3. Chromium、Firefox、WebKit 自动 smoke；严格 CSP smoke 禁止 `eval`、`Function` 和内联脚本。
4. 完整中英运行时语言切换 smoke，包含菜单、操作命令、编辑提示与 ARIA/读屏文案。
5. 生产依赖的 `high`/`critical` 漏洞扫描、许可证兼容性扫描、密钥扫描均无阻断发现。
6. 每个公开包 README 完整且其最小示例可由最终 tarball 运行。

### 6.2 正式版额外门禁

`1.0.0` 除 RC 门禁外，还必须有真实、可复核的以下证据：

1. F3 正式报告同时为 `releaseQualified: true` 与 `f3Pass: true`。
2. 人工 WCAG 2.2 AA 和读屏测试记录，且首个正式版有真实 Safari 手工验收记录。
3. 完整 2 小时 soak 测试报告。
4. 许可证、漏洞、密钥扫描与最终依赖清单均合格。

当前仓库已明确 F3 正式资格未闭合。因此本基线只能支持 RC 工程准备，不能据此声明正式版可发布。

### 6.3 供应链与归档

- 每次 Release 生成 SPDX 或 CycloneDX SBOM，并作为 GitHub Release 附件。
- 使用 npm provenance；发布工件、SBOM、SRI 和包哈希来自同一次 CI 构建。
- 真实密钥、令牌或私钥，以及生产依赖中的 high/critical 漏洞和不兼容许可证，都阻断 RC 与正式版。
- 发布后漏洞通过私密报告、安全公告、`npm deprecate` 和修复版本处置，不撤回或覆盖已安装工件。

## 7. 文档、社区与协作

| 项 | 已确认配置 |
| --- | --- |
| npm 主文档 | 中文为主；英文按需提供补充说明 |
| 包级 README | 独立说明安装、最小示例、公开 API、peer dependency、SSR/浏览器限制、销毁、兼容性与故障排查 |
| GitHub Release Notes | 描述新增、修复、破坏性变更、迁移和已知限制 |
| 外部贡献 | 接受 GitHub PR；由单人维护者审阅，不承诺处理时限 |
| `CONTRIBUTING.md` | 说明本地验证、用户可见变更的 Changeset 与文档要求 |
| DCO | 外部每个提交必须带 `Signed-off-by`，CI 验证 |
| 行为准则 | `CODE_OF_CONDUCT.md` 采用 Contributor Covenant，由维护者执行 |
| 安全 | `SECURITY.md` 指向 GitHub Private Vulnerability Reporting |

首次发包前的人工配置：npm 组织 `@qkplm` 的唯一 Owner 必须启用 2FA 并保管恢复方式；在 npm
包设置中为本仓库的 Release workflow 配置 Trusted Publishing；在 GitHub 默认分支启用 PR/CI
ruleset，并开启 Private Vulnerability Reporting。上述远端设置不能由本地仓库文件替代。

## 8. 组件运行时国际化

### 8.1 公开契约

| ID | 已确认配置 | 规则 | 验证方式 |
| --- | --- | --- | --- |
| I18N-001 | 首发内置语言 | 随 Core 同步内置 `zh-CN` 与 `en-US`，不异步加载、不发网络请求 | 离线运行时切换测试 |
| I18N-002 | 默认语言 | `zh-CN` | 初始化 API/视觉/ARIA smoke |
| I18N-003 | 切换入口 | 宿主控制；组件不添加悬浮或全局语言按钮 | Core、React、Vue、UMD API 测试 |
| I18N-004 | 完整覆盖 | 所有组件自有操作命令、右键/列菜单、快捷键说明、编辑提示、确认/错误、空状态、ARIA/读屏与 live region 文案使用语言包 | 语言键覆盖检查和浏览器 smoke |
| I18N-005 | 自定义命令 | 使用双语 `LocalizedText`；当前 locale 缺失英文时回退 `zh-CN` | 自定义菜单切换测试 |
| I18N-006 | 状态不变量 | 切 locale 不改变 Snapshot、revision、Undo/Redo 历史、选区、草稿、视口、挂载代际或 DataSource 状态 | 状态等价回归 |
| I18N-007 | 业务内容边界 | BOM 字段值、列标题、宿主自定义业务文案不被 SDK 擅自翻译 | 负向测试 |
| I18N-008 | 格式化 | 内置日期、数值、货币等展示遵循当前 `Intl` locale；规范值不变 | `Intl` fixture |
| I18N-009 | 文本方向 | 首发的 `zh-CN`/`en-US` 均为 `ltr`；现有 `direction` API 保持兼容，RTL 不随本次中英能力承诺 | API 回归 |

初始公开 API 形态如下，具体类型名以实现后的 API 报告为准：

```ts
type BomEditorLocale = 'zh-CN' | 'en-US';

type LocalizedText = Readonly<{
  'zh-CN': string;
  'en-US'?: string;
}>;

component.configurePresentation({ locale: 'en-US' });
```

语言包是受控、静态的组件资源。宿主为组件菜单、命令扩展或其他自定义覆盖传入
`LocalizedText` 时，组件按当前 locale 选择文案；缺少英文时严格回退中文。渲染期间不得调用
宿主翻译回调，防止渲染副作用、非确定性或性能抖动。

目前的 `locale`、`labels` 和 `configurePresentation()` 只能提供局部呈现配置；在 I18N-001 至
I18N-006 及其测试完成前，不能宣称已完成完整运行时国际化。

## 9. 实施波次与可追溯性

| 波次 | 交付物 | 前置条件 | 完成条件 | 主要 ID |
| --- | --- | --- | --- | --- |
| W1 | 许可证、元数据、公开/私有包边界、Changesets、基础文档 | 本基线 | 公开包 allowlist 和 package metadata 可校验 | PUB-001..007, REL-001..005 |
| W2 | 自包含 Core、React/Vue 依赖迁移、真实 UMD 构建、tarball smoke | W1 | 独立空目录安装四包全部成功 | PUB-003..005 |
| W3 | 双语语言包、完整键表、`LocalizedText`、切换与状态回归 | W2 | I18N smoke 和 API 基线通过 | I18N-001..009 |
| W4 | GitHub CI、Release OIDC、provenance、发布校验、SBOM/SRI | W1, W2 | Release dry-run 可产生所有工件且不发包 | CICD-001..006, REL-006 |
| W5 | 社区与安全文件、CDN 文档、体积报告、跨浏览器/CSP smoke | W2, W3 | RC 门禁具备自动执行路径 | 第 6、7 节 |
| W6 | RC 发布 | W1..W5 | 发布 `1.0.0-rc.1` 至 `next` | REL-001 |
| W7 | 正式发布鉴定 | F3 及正式版附加门禁 | 真实证据完整后发布 `1.0.0` | REL-002, 第 6.2 节 |

每项代码、测试和 CI 变更必须在提交说明、Changeset 或 Release Notes 中引用至少一个本文件的
ID。改变公开包边界、许可证、版本策略、发布身份、质量门禁或 i18n 状态不变量时，必须先修改
本基线并重新评审相关实施波次。

## 10. 当前结论

当前状态为 `IMPLEMENTATION_VERIFIED`（限本地工程）：W1/W2 的公开包边界、自包含构建、UMD/SRI 与
tarball smoke，W3 的内置双语词条和状态回归，以及 W4/W5 的本地脚本、工作流、治理文件和三浏览器
严格 CSP smoke 均已通过。仍需在 GitHub/npm 远端完成 Trusted Publishing、规则集、私密漏洞报告和
真实 CI 运行证据。

F3 正式资格、跨浏览器人工验收、读屏/WCAG、两小时 soak 和 npm 实际发布均未完成。因此不得将
任何 npm 包标记为已发布、RC 合格或生产认证。
