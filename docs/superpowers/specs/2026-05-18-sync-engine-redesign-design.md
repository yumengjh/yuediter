# Markdown 富文本编辑器同步引擎重设计

**日期：** 2026-05-18  
**项目：** `F:\yuediter`（前端） / `F:\yuweb\back\server`（后端）  
**主题：** 单人优先、增量同步、自动保存不入正式版本的同步引擎重构设计

---

## 1. 背景与结论摘要

当前项目是一个基于 TipTap 的 Markdown 超集富文本编辑器，前端位于 `F:\yuediter`，后端位于 `F:\yuweb\back\server`。项目已经具备块级数据模型、批量块操作接口、版本历史、发布、回滚和 diff 能力，但当前“同步”链路仍然沿用“整文档拉取 + 整文档比较 + 批量回写”的思路，导致自动保存体验明显偏慢。

本次设计的最终决策如下：

1. **采用前后端协同重设计，而不是只做前端修补。**
2. **以单人编辑体验为优先目标，不直接进入 OT / CRDT 实时协同架构。**
3. **自动保存只负责快速落草稿，不进入正式版本历史。**
4. **手动保存才创建正式版本。**
5. **同步模式采用本地优先（local-first）+ 后台增量 flush + 手动保存强一致。**
6. **第一阶段的技术前提是先补齐编辑器内 block identity，因为当前 TipTap JSON 中 `data-block-id` 为 `null`，无法直接作为增量同步锚点。**

一句话概括本次重构：

> 先补齐 editor block identity（`blockId` / `clientId`），再引入独立的前端同步引擎，以块级增量操作替换现有整文档同步链路；自动保存只落草稿，手动保存才创建正式版本。

---

## 2. 当前实现现状与问题定位

### 2.1 前端现状

当前前端同步相关实现主要散落在以下文件：

- `F:\yuediter\src\components\EditorPage.tsx`
- `F:\yuediter\src\contexts\DocumentContext.tsx`
- `F:\yuediter\src\hooks\useAutoSave.ts`
- `F:\yuediter\src\services\document.ts`
- `F:\yuediter\src\services\tiptap-converter.ts`
- `F:\yuediter\src\components\markdown-editor\MarkdownEditor.tsx`
- `F:\yuediter\src\components\markdown-editor\extensions\blockIdAttribute.ts`

当前链路大致如下：

1. `MarkdownEditor` 在 `onUpdate` 时输出整份 TipTap JSON。
2. `EditorPage` 用 `useAutoSave(content, saveDoc, { delay: 2000 })` 在 2 秒防抖后触发保存。
3. `DocumentContext.saveDoc()` 先用内存中的 `lastSavedContentRef` 做粗粒度重复判断。
4. `saveDocumentContentV2()` 在 JSON 模式下进入 `saveJsonContent()`。
5. `saveJsonContent()` 每次保存都先调用 `getDocumentContent(docId)` 拉取整篇文档树。
6. 前端基于拉回来的 block 列表与当前 TipTap JSON 重新做 diff。
7. 前端拼装 `/blocks/batch` 请求。
8. 后端处理批量块操作，并根据 `createVersion` 语义决定是否推进版本。

### 2.2 后端现状

当前后端同步和版本相关实现主要位于：

- `F:\yuweb\back\server\src\modules\blocks\blocks.service.ts`
- `F:\yuweb\back\server\src\modules\blocks\dto\batch-block.dto.ts`
- `F:\yuweb\back\server\src\modules\documents\documents.service.ts`
- `F:\yuweb\back\server\src\modules\documents\documents.controller.ts`
- `F:\yuweb\back\server\src\modules\documents\services\version-control.service.ts`

后端已经具备良好的块级能力：

- `POST /blocks/batch` 支持 `create / update / delete / move`
- `createVersion: false` 已存在
- `POST /documents/:docId/commit` 已存在
- `GET /documents/:docId/content` 支持按版本重建树
- `GET /documents/:docId/diff` 支持块级差异
- `GET /documents/:docId/pending-versions` 支持查看待提交数量

但这些能力并未被前端按“增量同步协议”方式使用，而是仍被挂接在整文档保存模式下。

### 2.3 已确认的关键问题

本轮调研中，已经确认以下核心问题：

#### 问题 1：自动保存前先读整篇文档
当前自动保存不是“把已有脏数据直接发出去”，而是每次都先 `GET /documents/:docId/content`，导致链路长度和响应时间与文档规模强耦合。

#### 问题 2：前端以整文档为同步单位
前端当前是“整份 TipTap JSON -> 保存时再做 diff”，不是“编辑时记录受影响 block”。这让同步工作量集中在保存时爆发。

#### 问题 3：后端 `getContent` 的成本不适合作为自动保存热路径
后端内容读取本质上要基于修订版本和块版本映射来重建文档树，这个接口适合“打开文档 / 查看历史 / 局部重载”，不适合每轮自动保存前都调用。

#### 问题 4：版本系统与自动保存耦合过深
现有系统存在“写草稿”和“生成版本”语义纠缠的问题。虽然接口层已经支持 `createVersion: false`，但整体架构上还没有明确把自动保存与正式版本提交完全拆开。

#### 问题 5：编辑器内部缺少稳定的块身份
目前 TipTap 产出的 JSON 结构中 `data-block-id` 为 `null`，这意味着同步引擎无法直接通过当前 JSON 精确判断“这个顶层 block 对应后端哪个 blockId”。

#### 问题 6：`data-block-id` 不足以承担同步主键职责
即便将来修复 DOM attribute 注入，也不应把它当成唯一事实来源。因为新建块在未落库前没有真实 `blockId`，仅依赖服务端 ID 无法支撑完整本地优先同步。

### 2.4 当前最严重的用户痛点
用户已明确指出，当前最主要的问题是：

> **同步慢。**

本次设计聚焦解决“同步慢”，而不是同时追求多人实时协同、复杂冲突合并或离线协作。

---

## 3. 设计目标与非目标

### 3.1 核心目标

#### 目标 A：显著缩短自动保存链路
自动保存不应再依赖“先拉全量 content 再做 diff”。

#### 目标 B：提升打字与编辑过程的体感
用户输入后，UI 应始终本地立即响应；网络同步在后台异步进行，不阻塞编辑。

#### 目标 C：把“草稿同步”和“正式版本保存”分离
自动保存只做草稿落库；手动保存才创建正式 revision。

#### 目标 D：同步单位从整文档降到 block 级别
同步引擎应围绕 block create / update / delete / move 工作，而不是围绕整份 TipTap 文档。

#### 目标 E：为以后演进预留空间
第一阶段不做 OT / CRDT，但设计中要预留：

- 基于版本的轻量冲突检测
- 多标签页检测与恢复
- 局部 reload / 局部纠偏
- 未来升级到多人协同时的可扩展接口语义

### 3.2 非目标

第一阶段明确**不做**以下内容：

1. 多人实时协同编辑
2. OT / CRDT 引擎
3. 自动 merge UI
4. 离线持久化队列
5. 完整 transaction 级语义回放
6. 兼容长期双格式同步核心（legacy HTML 与 JSON 同步并存）

---

## 4. 总体架构设计

### 4.1 总体原则

本次重构采用：

> **Local-first + Block-based Incremental Sync + Draft Flush + Manual Commit**

即：

- 本地优先更新 UI
- 同步粒度为块级增量操作
- 自动保存只 flush 草稿
- 手动保存执行 flush barrier 后再 commit

### 4.2 目标架构分层

同步能力将被拆成 4 层：

#### 第 1 层：编辑器层
职责：
- 渲染内容
- 接收用户输入
- 发出内容和结构变更事件

不再承担：
- 整文档保存决策
- 保存时全量 diff
- 正式版本提交决策

#### 第 2 层：前端同步引擎层
新增独立模块，负责：
- 维护本地同步会话
- 维护 dirty block / pending queue / inflight batch
- 把编辑器变更转换为块级操作
- 批量 flush 到后端
- 管理同步状态机
- 在手动保存时执行 flush + commit

#### 第 3 层：后端增量写入层
以增强版 `/blocks/batch` 作为同步主通道，负责：
- 接收块级增量操作
- 落块版本与块状态
- 返回可确认的 batch ack
- 支持轻量冲突检测

#### 第 4 层：文档版本层
保留现有版本体系，但角色变更：
- 自动保存：不创建正式版本
- 手动保存：创建正式版本
- 历史 diff / publish / revert：继续依赖正式版本体系

### 4.3 新数据流

#### 打字时
1. 用户编辑
2. 编辑器本地立即更新
3. 同步引擎识别受影响 block
4. 对应 block 标记为 dirty
5. 更新本地队列
6. 后台定时 flush

#### 自动保存时
自动保存不再表示“整篇保存”，而是：
- 将当前 dirty 队列批量发送到 `/blocks/batch`
- 请求携带 `createVersion: false`
- 成功后只更新“已同步到草稿”状态

#### 手动保存时
1. 阻止新的普通 flush 插入
2. 等待 inflight batch 完成，必要时接管重发
3. 强制 flush 剩余 dirty
4. 确认本地队列清空
5. 调用 `POST /documents/:docId/commit`
6. 更新 `lastCommittedVersion`

---

## 5. 编辑器块身份（Identity）设计

### 5.1 设计前提

当前 TipTap JSON 中 `data-block-id` 为 `null`，因此第一阶段必须先解决“块身份锚点”问题，否则无法进行精确增量同步。

### 5.2 设计原则

同步引擎不能只依赖 DOM attribute，也不能只依赖服务端 `blockId`。原因如下：

- 新建块在落库前没有真实 `blockId`
- DOM / HTML 属性在序列化与转换过程中不可靠
- 当前 `data-block-id` 已验证为 `null`

因此需要引入双 ID 机制。

### 5.3 双 ID 模型

每个 block 在前端编辑器中都带两个身份字段：

- `blockId`：后端真实块 ID，已落库块存在
- `clientId`：前端稳定本地 ID，所有块都存在

### 5.4 规则

#### 已存在块
- `blockId` 已知
- `clientId` 固定
- flush update / move / delete 时可直接定位后端块

#### 新建块
- 创建时立即生成 `clientId`
- `blockId = null`
- 进入同步队列后以 `clientId` 为临时主键
- 后端成功创建后返回真实 `blockId`
- 前端把该 `clientId` 对应块补齐映射

#### 删除块
- 对于已有块：发 delete
- 对于本地新建未落库块：直接从本地状态与 dirty map 中移除，不发 delete

### 5.5 身份字段的载体

第一阶段建议将 identity 放入 TipTap block 级节点 attrs 中，例如概念上：

- `attrs.blockId`
- `attrs.clientId`

`data-block-id` 可以继续保留，但仅作为：
- 调试辅助
- HTML 回显辅助
- 兼容性桥接

**不能再作为同步引擎唯一主键。**

### 5.6 加载时注入策略

文档加载后，前端将后端 block tree 重组为 TipTap JSON 时，应：

1. 为所有已有块注入 `blockId`
2. 为所有块生成或保留 `clientId`
3. 保证同一块在本次编辑会话内 `clientId` 稳定

### 5.7 新建块的 ID 补全策略

同步引擎 flush create 操作成功后，后端 ack 中必须返回：
- 创建成功的临时标识（推荐 `clientId`）
- 创建后的真实 `blockId`

前端据此更新：
- TipTap 文档中该块 attrs
- 本地 identity map
- dirty / pending / inflight 索引

---

## 6. 前端同步引擎设计

### 6.1 设计定位

前端需要从当前的 `useAutoSave` 提升到一个独立的同步基础设施。建议引入如下概念模块：

- `DocumentSyncEngine`
- `SyncSession`
- `SyncQueue`

同步引擎不应再依赖“保存时全量 diff”，而应在“编辑时增量采集”。

### 6.2 同步会话模型

每个打开文档维护一个同步会话：

```ts
type SyncState = "idle" | "dirty" | "flushing" | "error" | "conflicted";

type SyncSession = {
  docId: string;
  baseVersion: number;
  localRevision: number;
  syncState: SyncState;
  lastSyncedAt: number | null;
  lastCommittedVersion: number | null;
};
```

字段含义：

- `baseVersion`：本地草稿是基于哪个正式版本开始编辑
- `localRevision`：本地编辑递增计数，用于避免旧 flush 结果覆盖新状态
- `syncState`：同步状态机当前值
- `lastSyncedAt`：最近一次草稿 flush 成功时间
- `lastCommittedVersion`：最近一次手动保存完成后的正式版本号

### 6.3 同步状态语义

- `idle`：无未同步改动
- `dirty`：有本地改动尚未成功同步
- `flushing`：正在向后端发送一批增量
- `error`：同步失败，可重试
- `conflicted`：检测到版本冲突或需要人工刷新/恢复

### 6.4 Dirty 数据模型

同步引擎不保存“整篇文档待同步”，而保存 block 级脏数据。

```ts
type BlockOpType = "create" | "update" | "delete" | "move";
type EntryStatus = "pending" | "inflight" | "failed";

type DirtyBlockEntry = {
  clientId: string;
  blockId: string | null;
  opType: BlockOpType;
  payload?: Record<string, unknown>;
  parentId?: string | null;
  sortKey?: string | null;
  indent?: number | null;
  localRevision: number;
  status: EntryStatus;
};
```

### 6.5 核心内存结构

#### DirtyBlockMap
`Map<clientId, DirtyBlockEntry>`

#### PendingQueue
本轮准备 flush 的操作集合。它不一定与 dirty map 一一对应，因为会做操作合并。

#### InflightBatch
当前已发出但未确认的 batch：

```ts
type InflightBatch = {
  clientBatchId: string;
  revisionAtDispatch: number;
  operations: DirtyBlockEntry[];
  sentAt: number;
};
```

### 6.6 为什么采用 block 粒度

因为当前后端模型天然是块级：

- `Block`
- `BlockVersion`
- `/blocks/batch`
- move / update / delete

因此最自然的同步粒度就是 block，而不是整篇 TipTap JSON。

### 6.7 变更采集策略

#### 原模式
- `onChange` 得到整篇 JSON
- 保存时再做全量比对

#### 新模式
- 编辑发生时即识别受影响 block
- 同步引擎立即更新 dirty map
- 保存只是 flush dirty queue，不再做大规模文档级计算

### 6.8 第一阶段的变更采集边界

由于当前尚未具备完美的 transaction 级语义采集能力，第一阶段建议分层接入：

#### 内容变更
基于顶层 block identity（`blockId` / `clientId`）标记 dirty，并提交 update。

#### 结构变更
优先从现有显式命令入口接管：
- 工具栏动作
- 块工具栏动作
- 新建块命令
- 删除块命令
- 移动块命令

第一阶段不要求把所有 ProseMirror transaction 全部语义化。

### 6.9 Flush 触发策略

可组合使用以下触发条件：

1. 防抖触发：800ms ~ 1500ms
2. 数量阈值触发：dirty block 数达到上限
3. 页面失焦触发
4. 切文档前触发
5. 页面关闭前 best-effort 触发

### 6.10 Flush 行为

每次 flush：

1. 从 dirty map 取出当前可提交条目
2. 合并同一 block 的重复操作
3. 生成 `clientBatchId`
4. 记录 inflight batch
5. 请求 `/blocks/batch`，统一 `createVersion: false`
6. 成功后确认对应 dirty entry
7. 更新 `lastSyncedAt`
8. 若失败，转入 `error` 并保留重试能力

### 6.11 操作合并规则

同步队列必须支持归并，否则频繁编辑会产生大量无效操作。

建议支持至少以下规则：

- `create + update` -> 合并成一个 `create`
- `update + update` -> 只保留最后一次 `update`
- `create + delete` -> 直接抵消，不发请求
- `move + move` -> 只保留最终位置
- `update + delete` -> 最终为 `delete`
- `move + update` -> 同一 batch 内按稳定顺序拼装

### 6.12 手动保存语义

手动保存不再直接调用旧 `saveDoc(content)`，而是同步引擎内的高优先级流程：

```ts
await syncEngine.flush({ reason: "manual-save", force: true });
await syncEngine.commit("手动保存");
```

语义为：

- `flush`：把所有草稿修改先落库
- `commit`：创建正式版本

### 6.13 UI 状态语义

建议 UI 拆成两类状态：

#### 同步状态
- 未同步
- 同步中
- 同步失败
- 已同步到草稿

#### 版本状态
- 尚未生成正式版本
- 已保存为版本 `vX`

这两个概念不能再混淆。

---

## 7. 后端接口与协议设计

### 7.1 设计原则

本次后端重构不推翻现有块级和版本体系，而是在现有基础上补齐“同步协议”语义。

### 7.2 协议主通道

保留 `POST /blocks/batch`，但将其升级为真正的同步主通道。

当前问题在于：
- 前端仍先全量读取再 diff
- `/blocks/batch` 更像保存结果执行器，而不是同步协议本身

目标改造后：
- 前端直接提交块级增量操作
- 不再在自动保存前调用 `GET /documents/:docId/content`

### 7.3 请求语义增强

增强版 batch 请求建议至少携带：

- `docId`
- `baseVersion`
- `clientBatchId`
- `source: "autosync" | "manual-save"`
- `createVersion: false`
- `operations[]`

其中：

#### `baseVersion`
表示本地编辑起点基于哪个正式版本，用于轻量并发与过期检测。

#### `clientBatchId`
表示这轮 flush 的客户端批次编号，用于 ack 确认、去重和排障。

#### `source`
用于区分自动同步与手动保存，便于日志、监控与行为差异化。

### 7.4 Ack 返回模型

后端返回不应只包含简单 success / failed 计数，而应返回可被同步引擎消费的 ack：

- `acceptedBatchId`
- `appliedAt`
- `serverHead`
- `results[]`
- `conflicts[]`
- `needsReload`

其中：

#### `acceptedBatchId`
用于确认本次返回对应哪个 inflight batch。

#### `serverHead`
用于同步引擎了解当前服务端正式版本位置。

#### `results[]`
每个 operation 的精确执行结果，尤其 create 需要返回 `clientId -> blockId` 映射。

#### `conflicts[]`
用于标记版本冲突、块已不存在、块状态过期等异常。

#### `needsReload`
表示当前客户端状态是否已不适合继续增量写入，应转入局部或全量 reload。

### 7.5 轻量冲突检测

即使第一阶段不做多人协同，也建议引入最轻量的基于版本的并发保护。

前端每次 batch 请求带：
- `baseVersion` 或 `expectedHead`

后端可基于此判断：
- 是否仍在预期版本线上写草稿
- 是否出现旧页面写入
- 是否需要将客户端置为 `conflicted`

这一步不是为了阻止一切写入，而是为了让系统具备“识别不一致”的能力。

### 7.6 自动保存与正式版本提交彻底分离

协议层应明确规定：

#### 自动保存
只允许：
- `/blocks/batch` with `createVersion: false`

#### 手动保存
固定两步：
1. flush dirty batch
2. `POST /documents/:docId/commit`

这样可以直接减少：
- `head` 的高频增长
- revision 记录膨胀
- `getContent(version=...)` 的重建压力

### 7.7 新增轻量状态接口

建议新增一个轻接口，例如：

`GET /documents/:docId/sync-state`

返回：
- `docId`
- `head`
- `publishedHead`
- `hasPendingDraft`
- `pendingCount`
- `updatedAt`

用途：
- 初始化同步状态
- 手动保存后刷新状态
- 判断本地是否落后
- 避免为了一点状态信息拉整篇内容树

### 7.8 `GET /documents/:docId/content` 的职责收缩

该接口继续保留，但退出自动保存热路径。它只用于：

1. 初次打开文档
2. 冲突恢复
3. 手动刷新
4. 版本 diff / revert / 历史查看
5. 大文档局部分页加载

**不再用于每轮自动保存前的前置读取。**

### 7.9 局部 reload 能力

当前后端已经具备：
- `startBlockId`
- `limit`
- `maxDepth`

建议将其明确为冲突恢复与局部纠偏能力：
- 某个块冲突时局部 reload
- 某个 batch 局部失败时只回拉受影响子树
- 避免大文档全量 reload

### 7.10 批量写入的原子语义

当前 `/blocks/batch` 更偏向逐条执行并返回结果，可能出现部分成功语义。

对同步引擎而言更理想的目标是：

#### 自动同步优先采用严格原子模式
- 一批操作要么全部成功，要么全部失败

如果暂时无法做到严格原子，也必须满足：
- 返回精确失败项
- 标明是否可重试
- 标明是否需要 reload

第一阶段推荐自动同步尽量向严格原子靠拢，以降低前端队列复杂度。

### 7.11 DTO 建议

即便继续使用 `/blocks/batch` 路径，也建议补一个偏同步协议语义的 DTO，而不是只复用业务批处理 DTO。至少要扩展：

- `clientBatchId`
- `baseVersion`
- `source`
- 更强的 create ack
- 更强的 conflict ack

---

## 8. Legacy 文档与格式迁移策略

### 8.1 当前现状

当前系统同时兼容：
- legacy HTML payload
- TipTap JSON payload

### 8.2 风险

如果让新同步引擎长期承受双格式同步核心，将显著增加复杂度，并破坏 block identity 的清晰边界。

### 8.3 第一阶段策略

第一阶段建议明确：

1. **新同步引擎只服务 TipTap JSON 文档。**
2. legacy HTML 文档在首次编辑或首次加载进入编辑态时，优先迁移为 JSON payload。 
3. 保留只读兼容，但不让新引擎长期背双格式负担。

### 8.4 设计原则

> 双格式兼容应被限制在“加载/迁移边界”，不能渗透进同步核心。

---

## 9. 迁移与落地策略

### 9.1 总体迁移原则

本次改造不采用大爆炸重写，而采用分阶段平滑替换：

> 先补身份，再补协议，再引入同步引擎，再切断旧热路径。

### 9.2 第一阶段推荐改造顺序

#### Phase 1：补齐编辑器 block identity
目标：
- 在 TipTap block 节点 attrs 中注入 `blockId` / `clientId`
- 修复当前 `data-block-id` 为 `null` 的问题
- 建立已有块与新建块的统一身份模型

#### Phase 2：增强后端同步协议
目标：
- 增强 `/blocks/batch` ack
- 引入 `clientBatchId` / `baseVersion` / `source`
- 新增 `sync-state` 轻接口
- 保持历史版本/发布/回滚逻辑不变

#### Phase 3：引入前端 SyncEngine
目标：
- 新建独立同步模块
- 接管自动保存
- 保留旧 `saveDoc` 路径作为临时 fallback

#### Phase 4：切换到增量 flush
目标：
- 自动保存不再先拉整篇 content
- 自动保存只走 dirty block queue
- 手动保存改成 flush + commit

#### Phase 5：清理旧链路
目标：
- 旧全量 diff 保存路径不再是热路径
- `saveDocumentContentV2` 职责收缩为兼容或工具函数
- `useAutoSave` 降级为轻调度器，或被新引擎取代

### 9.3 关键风险与应对

#### 风险 A：无法稳定识别块级编辑
应对：
- 第一阶段不追求完美 transaction 语义
- 先接内容编辑与显式结构命令入口

#### 风险 B：新建块无服务端 ID
应对：
- 使用 `clientId`
- 通过 create ack 回填 `blockId`

#### 风险 C：手动保存与自动同步打架
应对：
- 引入 flush barrier
- 手动保存是同步引擎中的高优先级事务

#### 风险 D：切文档 / 关闭页面丢草稿
应对：
- 切换文档前强制 flush
- 页面失焦 flush
- 页面关闭前使用 `sendBeacon` / `keepalive` best-effort flush
- flush 失败时给出未同步提示

#### 风险 E：大文档排障困难
应对：
- 第一阶段就加同步日志与性能指标

---

## 10. 第一阶段明确边界

### 10.1 第一阶段要完成的能力

第一阶段范围限定如下：

1. 只支持**单人编辑**
2. 只支持 **TipTap JSON 文档** 作为新同步引擎主路径
3. 自动保存只做**增量落草稿**
4. 手动保存才执行 **commit version**
5. 支持以下操作的正确同步：
   - block content update
   - block create
   - block delete
   - block move
6. 支持切文档前 flush
7. 支持基础失败重试
8. 支持基础冲突检测与 reload 提示

### 10.2 第一阶段明确不做的能力

1. 多人实时协同
2. 自动 merge
3. 离线持久队列
4. 复杂冲突解决 UI
5. 完整 transaction replay
6. 长期维持 legacy HTML 与 JSON 并行同步内核

---

## 11. 验收标准

### 11.1 性能验收

必须满足：

1. 自动保存**不再调用**“保存前整篇 `getContent`”。
2. 普通内容编辑只产生块级增量 batch，而非整文档 diff 保存。
3. 大文档下输入不因自动保存出现明显卡顿。
4. `GET /documents/:docId/content` 不再处于自动同步热路径。

### 11.2 正确性验收

必须满足：

1. 修改单块内容，只更新对应 block。
2. 新建块后能正确获得真实 `blockId` 并回填到本地文档状态。
3. 删除块后刷新页面状态一致。
4. 移动块后刷新页面状态一致。
5. 手动保存始终执行“先 flush，后 commit”。
6. 自动保存成功后，草稿已落库但不会生成正式版本。

### 11.3 体验验收

UI 至少能区分以下状态：

- 未同步
- 同步中
- 同步失败
- 已同步到草稿
- 已保存为正式版本

### 11.4 工程结构验收

必须满足：

1. 同步逻辑从 `useAutoSave + DocumentContext.saveDoc + saveDocumentContentV2` 中抽离为独立模块。
2. 旧全量保存链路不再是自动保存主路径。
3. `/blocks/batch` 被明确用作同步主通道，而不是全量保存后的执行器。

### 11.5 可观测性验收

建议第一阶段即提供最基础监控字段：

#### 前端
- dirty block 数
- flush 次数
- batch 大小
- flush 耗时
- 失败次数

#### 后端
- batch operation 数
- batch 总耗时
- 各 operation 数量
- commit 耗时
- getContent 耗时

---

## 12. 最终设计结论

本次同步引擎重构的核心，不是继续优化一个 `useAutoSave` hook，也不是进一步打补丁式地压缩全量 diff 成本，而是：

1. **先补齐编辑器 block identity（`blockId` / `clientId`）。**
2. **引入独立的前端同步引擎，围绕 dirty block / batch flush / inflight ack 工作。**
3. **将自动保存从“整文档保存”改造成“块级增量落草稿”。**
4. **让手动保存成为“flush barrier + commit”的正式版本创建动作。**
5. **让后端 `/blocks/batch` 从业务批处理接口升级为真正的同步协议主通道。**
6. **让 `GET /documents/:docId/content` 退出自动同步热路径，仅承担加载、历史、恢复与局部 reload 职责。**

因此，本项目的推荐重构路线可以被浓缩为：

> **以 block identity 为锚点，构建 local-first 的增量同步引擎；自动保存只落草稿，手动保存才进入正式版本历史。**

这将直接解决当前最突出的“同步慢”问题，并为后续演进到更强的冲突检测、局部恢复和多人协作留下清晰边界。
