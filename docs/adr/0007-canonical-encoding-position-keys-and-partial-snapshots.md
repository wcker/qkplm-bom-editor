# ADR-0007：Canonical encoding、排序键与部分 Snapshot

- 状态：已接受
- 日期：2026-07-19
- 规范依据：[v2 白皮书](../../现代化高性能可复用BOM编辑器组件.md)，重点参见第 3、4、12、16 章

## 上下文

Snapshot、Patch、DataSource、Worker、Undo 和导入导出需要跨包比较同一份 BOM。只把 `positionKey`、哈希和部分加载状态定义为普通字符串或可选字段，会让不同实现采用 locale 排序、不同 JSON 序列化或互相冲突的“已加载”含义。

这些差异在单实例样例中不明显，但会在远程 Patch、结构 Diff、Undo 哈希、流式加载和协议迁移时造成顺序漂移、错误冲突或错误地把部分数据当成完整文档。

## 决策

1. 每个 Snapshot 必须携带 `positionKeyCodecVersion`。首个稳定 codec 为 `lexicographic-ascii-v1`：键包含 1–128 个可打印 ASCII 字节，使用无 locale 的逐 ASCII 字节升序；同级键唯一。
2. `positionKey` 对调用方不透明。普通命令使用 `BomPlacement`，只有 Core 或受信兼容协议生成 key。夹缝空间耗尽时，在同一原子事务内执行确定性 `rebalancePositions`。
3. 未知 position codec 主版本必须拒绝或先迁移，禁止回退到 `localeCompare`、平台默认排序或自行猜测。
4. canonical encoding 使用 UTF-8、对象键 ASCII 升序、数组保序、无非语义空白，并拒绝非规范数字、危险键和不可序列化值。
5. 定义三种带域分隔符的 SHA-256：
   - `valueHash`：覆盖字段 ID、字段类型和规范字段值，用于字段乐观检查。
   - `contentHash`：覆盖 Schema、position codec、roots、节点身份、结构、物料引用和字段；排除 document ID、local/source revision 与加载 envelope。
   - `envelopeHash`：覆盖完整 Snapshot 元数据及 `contentHash`。
6. Undo/Redo 正确性比较 `contentHash`；交换、缓存或审计完整 envelope 时比较 `envelopeHash`。哈希算法或 canonical encoding 版本变化必须通过协议迁移，禁止跨版本直接比较。
7. 完整 Snapshot 的 roots 和全部直接子节点均已加载；`knownRootCount` 可以省略但语义等于 roots 数，节点 `childrenState` 只能为 `complete` 或省略。
8. 部分 Snapshot 必须提供 `knownRootCount`，且每个节点显式声明 `childrenState`：
   - `complete`：全部直接子节点已加载，known count 等于已加载数。
   - `partial`：加载了子集，known count 不小于已加载数。
   - `unloaded`：未加载任何直接子节点，known count 可以提供已知总数。
9. 部分 Snapshot 只验证已加载子图。无法证明全局安全的移动、完整导出和全局规则必须拒绝、先完整加载或交由完整 DataSource 原子验证。

## 后果

### 正面后果

- 本地、Worker、服务端和导入导出使用相同顺序与哈希语义。
- Undo 比较不受 revision 变化影响，完整 envelope 校验又不会遗漏元数据。
- 部分加载不会被误当成叶节点或完整文档。
- position codec 可以版本化演进，同时保持旧文档明确拒绝或迁移。

### 代价与约束

- Snapshot、Chunk、RecoveryBundle 和测试 fixture 增加 codec/完整度字段。
- canonical encoding 和 SHA-256 会产生计算成本，需要结构共享哈希和 Worker 派生计算，但最终提交仍由主线程核验。
- 排序键 rebalance 最坏触及同级多个节点，必须计入事务与复杂度预算。
- 部分文档的可编辑能力受限，DataSource 必须提供明确加载与一致性协议。

## 被否决方案

### 使用 localeCompare 排序 positionKey

否决原因：locale、浏览器和 ICU 版本会改变顺序，无法确定性重放 Patch。

### 直接用 JSON.stringify 结果作为唯一哈希输入

否决原因：对象键插入顺序、元数据边界和非规范数值会使语义相同的数据产生不同摘要，或把 revision 变化误判成内容变化。

### 只保留一种 Snapshot 哈希

否决原因：Undo 需要忽略 revision，而交换完整性需要覆盖 document 和 envelope 元数据，两者边界不同。

### 省略 childrenState，把未加载节点当作叶节点

否决原因：会错误允许跨未加载边界移动、错误导出不完整数据并产生错误汇总。

## 验证方式

- 使用固定 canonical fixture 对浏览器、Node 和 Worker 计算 value/content/envelope 三类 SHA-256，并逐字节对照 golden vector。
- 属性测试随机改变对象插入顺序，断言 canonical encoding 和 contentHash 不变；改变字段、结构或顺序时 contentHash 必须变化。
- 改变 local/source revision，断言 contentHash 不变、envelopeHash 变化。
- 以不同 locale 和 ICU 环境排序同一组 position key，断言结果与 ASCII golden 顺序一致。
- 连续夹缝插入触发 rebalance，断言事务原子、顺序稳定且 Undo 后 contentHash 恢复。
- 对 complete/partial/unloaded 的合法与非法组合运行表驱动测试，覆盖 known count、已加载子节点、完整导出和跨边界移动。
