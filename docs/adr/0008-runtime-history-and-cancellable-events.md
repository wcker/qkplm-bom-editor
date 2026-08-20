# ADR-0008：Runtime 历史入口与同步可取消事件边界

- 状态：已接受
- 日期：2026-07-18
- 规范依据：[v2 白皮书](../../现代化高性能可复用BOM编辑器组件.md)，重点参见第 4、8、10 章

## 上下文

首个可编辑纵向切片必须形成命令、提交、Undo 和 Redo 的完整闭环，但原有 BomEditor 最小接口只暴露 execute()、applyPatch() 和 transaction()。把 Undo/Redo 伪装成普通 BomCommand 会混淆领域意图与历史游标操作，也无法准确表达历史为空、事务来源和逆 Patch 的行为。

中立 contracts 同时承担 Worker、DataSource、日志和持久化协议，因此事件必须可序列化且不能包含函数。browser runtime 又需要在当前调用栈通过 preventDefault() 取消 before 事件。若直接把函数写入中立事件类型，会破坏无 DOM、跨线程边界；若只保留 cancellable: true，则 browser API 无法兑现白皮书的同步取消语义。

## 决策

1. browser runtime 的 BomEditor 公开独立 undo() 与 redo() 方法。它们进入与其他变更相同的 FIFO 队列，返回实际 BomCommit，但不属于 BomCommand 联合类型。
2. Undo/Redo 必须由 transaction 历史引擎生成并验证逆 Patch。失败、取消或历史为空时，Snapshot、revision、索引、内容哈希和历史游标全部保持不变。
3. @bom-editor/contracts 的事件 envelope 保持只读、无函数、可序列化。cancellable: true 只声明该事件在 browser runtime 可被同步取消。
4. browser runtime 定义强类型 BomEventMap。可取消事件在派发时包装为 BomRuntimeCancellableEvent，增加只读 defaultPrevented 与 preventDefault()；普通事件不增加该方法。
5. preventDefault() 只在同步监听器派发栈内有效。包装对象不跨 Worker/DataSource，不持久化，也不进入结构化日志。异步授权和校验继续使用 Policy 与 AbortSignal。
6. F3 使用到的事务、编辑、选区、视图和生命周期事件必须具有具名字段；中立协议中暂未专门建模的交互 payload 由 browser runtime 收紧，不把 DOM 类型反向引入 contracts。

## 后果

### 正面后果

- 程序化 API、键盘快捷键和工具栏可以共享同一历史语义与测试。
- 领域命令保持业务意图纯净，历史操作不会污染插件命令命名空间。
- 中立协议继续支持 SSR、Node、Worker 和 DataSource，browser 侧同时拥有符合 DOM 习惯的同步取消体验。
- TypeScript 可以按事件名称推断具体载荷，减少 BomValue 断言和运行时字段猜测。

### 代价与约束

- runtime 需要维护 envelope 到短生命周期包装对象的适配层。
- contracts 与 browser event map 需要契约测试，防止事件名称、公共字段或取消能力漂移。
- Undo/Redo 需要同时覆盖 API、快捷键、事件顺序、取消和历史预算边界。

## 被否决方案

### 把 Undo/Redo 定义为插件命令

否决原因：历史是 Core 正确性能力，不是可选插件贡献；插件命令也无法可靠表达历史游标和逆 Patch 校验。

### 在中立事件 envelope 上直接加入 preventDefault()

否决原因：函数不可结构化克隆和持久化，会迫使 headless contracts 带入进程内运行时语义。

### 允许异步事件监听器决定取消

否决原因：会让输入和事务队列等待无界 Promise，并引入取消决定到达时 revision 已变化的竞态。

### 仅返回 cancellable: true 而不提供 browser 包装

否决原因：调用方无法执行规范要求的同步取消，类型契约与实际行为不完整。

## 验证方式

- API 类型测试断言 undo/redo 存在、返回 Promise<BomResult<BomCommit>>，且未进入 BomCommand。
- transaction/runtime 状态机测试覆盖成功、空历史、取消、FIFO、监听器重入和异常；失败路径比较前后 Snapshot 引用、revision、内容哈希与历史状态。
- 事件契约测试断言 neutral envelope 可结构化克隆且无函数；runtime before 事件具有 preventDefault/defaultPrevented，普通事件没有。
- 同步派发测试验证当前栈取消有效、迟到调用无效、一个监听器异常不阻断其他监听器，并保持规范事件顺序。
- Node/SSR 类型门禁不包含 DOM lib；browser runtime 类型门禁包含 DOM lib 并对每个事件名称做推断快照。
