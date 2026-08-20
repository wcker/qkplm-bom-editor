# BOM Editor 架构决策记录

本目录保存 BOM Editor 的架构决策记录（Architecture Decision Record，ADR）。项目唯一规范源是根目录的 [《现代化高性能可复用 BOM 编辑器组件 · 生产级技术白皮书 v2.0》](../../现代化高性能可复用BOM编辑器组件.md)，以下简称“v2 白皮书”。

ADR 用于记录规范约束背后的关键取舍、后果和验证方式，不建立第二套规范。若 ADR 与 v2 白皮书冲突，以 v2 白皮书为准；确需改变规范时，必须先修改并评审白皮书，再新增替代 ADR，禁止只修改旧 ADR 来掩盖历史决策。

## 决策索引

| 编号 | 决策 | 状态 |
| --- | --- | --- |
| [0001](0001-single-normative-source-and-three-layer-delivery.md) | 唯一规范源与三层交付架构 | 已接受 |
| [0002](0002-canvas-with-dom-semantics-and-editing.md) | Canvas 加 DOM 语义与编辑层 | 已接受 |
| [0003](0003-main-thread-authority-and-worker-derived-tasks.md) | 主线程权威模型与 Worker 派生任务 | 已接受 |
| [0004](0004-immutable-snapshot-and-command-patch-transactions.md) | 不可变 Snapshot 与 Command-Patch 事务 | 已接受 |
| [0005](0005-serialized-remote-confirmation-and-dependent-rollback.md) | 远程事务串行确认与依赖回滚 | 已接受 |
| [0006](0006-generative-ai-as-an-optional-plugin.md) | 生成式 AI 作为可选插件 | 已接受 |
| [0007](0007-canonical-encoding-position-keys-and-partial-snapshots.md) | Canonical encoding、排序键与部分 Snapshot | 已接受 |
| [0008](0008-runtime-history-and-cancellable-events.md) | Runtime 历史入口与同步可取消事件边界 | 已接受 |
| [0009](0009-stable-core-subpaths-over-physical-packages.md) | 以稳定 Core 子路径隐藏物理包边界 | 已接受 |
| [0010](0010-parallel-f4-performance-kernel-development.md) | F3 证据未闭合期间并行推进 F4 性能内核 | 已接受 |
| [0011](0011-qkplm-public-package-distribution-and-i18n.md) | QKPLM 公开包分发与首发中英国际化 | 已接受 |

## 状态定义

- `提议中`：正在评审，尚不能作为实现依据。
- `已接受`：已批准，相关实现和测试必须遵守。
- `已废弃`：决策不再适用于当前系统，但保留历史记录。
- `已替代`：由新的 ADR 取代，旧记录必须链接替代项。

## 编写与变更规则

1. ADR 使用四位连续编号；编号分配后不得复用。
2. 每份 ADR 至少包含状态、上下文、决策、后果、被否决方案和验证方式。
3. ADR 只记录跨模块、难以逆转或显著影响正确性、性能、兼容性与安全性的决策；局部实现细节留在代码和测试中。
4. 已接受 ADR 不进行改变原意的原地重写。决策变化时新增 ADR，并将旧 ADR 标记为“已替代”。
5. 每项可验证约束必须最终落到类型契约、自动化测试、基准或发布门禁之一。
