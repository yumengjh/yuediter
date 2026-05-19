# Sync Engine Phase 1 前端实现说明（合并版）

日期：2026-05-19  
分支：`codex/sync-engine-phase1`  
目标：在不破坏现网可用性的前提下，引入块级 identity 与增量同步能力，并保留可回退路径。

---

## 1. 背景与问题

旧自动保存路径是：

`onUpdate -> useAutoSave -> saveDocumentContentV2 -> getDocumentContent -> 前端全量 diff -> /blocks/batch`

主要问题：

1. 保存前必须拉全量内容，链路慢。  
2. 块身份不稳定（`data-block-id` 为空或丢失）导致误判。  
3. 容易出现“少量编辑触发大量 update / delete”。

---

## 2. 本次实现范围

## 2.1 身份层（已完成）

- 新增 `blockId + clientId` 双身份模型；
- 在编辑器节点 attrs 中补齐 identity；
- 修复重复 `clientId` / 重复 `blockId` 导致的错误映射。

关键文件：

- `src/services/sync/types.ts`
- `src/services/sync/identity.ts`
- `src/components/markdown-editor/extensions/blockIdAttribute.ts`

## 2.2 同步引擎层（已完成）

新增模块：

- `src/services/sync/reducer.ts`
- `src/services/sync/engine.ts`
- `src/services/sync/api.ts`
- `src/hooks/useDocumentSync.ts`

能力：

- dirty queue/inflight 管理；
- batch flush；
- create ack 回填；
- 手动保存 barrier；
- 冲突/失败状态显式化。

## 2.3 稳定性修复（已完成）

针对实测问题修复：

1. **无限 update**：ack 缺少 `clientId` 时按 inflight 索引/`blockId` 对账清队列。  
2. **delete 死循环**：`delete + not found` 视为幂等成功。  
3. **重复 identity**：文档级去重，后续重复块自动重置 identity。  
4. **手动保存冲突**：barrier 失败不再继续 commit。

---

## 3. 与旧链路的兼容策略

为避免回归风险，保留开关：

- `NEXT_PUBLIC_SYNC_ENGINE_ENABLED=true`：启用新同步引擎；
- 否则默认走旧 `saveDocumentContentV2` 自动保存。

即：**新引擎可灰度，旧路径可兜底**。

---

## 4. 关键协议约定（前端侧）

`POST /blocks/batch`（新模式）请求包含：

- `docId`
- `baseVersion`
- `clientBatchId`
- `source`（`autosync` / `manual-save`）
- `createVersion=false`
- `operations[]`

前端消费响应字段：

- `acceptedBatchId`
- `serverHead`
- `needsReload`
- `conflicts[]`
- `results[]`（含 create 回填 `clientId -> blockId`）

---

## 5. 测试与验证

新增测试：

- `src/services/sync/__tests__/identity.test.ts`
- `src/services/sync/__tests__/identity.uniqueness.test.ts`
- `src/services/sync/__tests__/reducer.test.ts`

覆盖：

- identity 补齐与唯一性；
- create/update/delete 合并规则；
- ack 对账；
- delete-not-found 幂等清队列。

---

## 6. 当前边界与后续建议

当前仍属 Phase 1：

- 非 OT/CRDT；
- 非多人实时协同；
- 非离线持久化队列。

后续建议：

1. 增加 move/reorder 的独立操作语义（减少 update 负担）；  
2. 增加同步链路指标（flush 次数、冲突率、平均 batch 大小）；  
3. 增加“局部重载”而非冲突后全量重载。

