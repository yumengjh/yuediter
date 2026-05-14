# Block Toolbar 实现记录

> 日期：2026-05-15
> 状态：基础功能已完成，菜单项部分实现

## 一、需求背景

为 Markdown++ 富文本编辑器添加类似 Notion 的块级浮动工具栏：鼠标悬停到任意块左侧时出现 6-dot 手柄，点击弹出操作菜单，支持上移/下移块位置。

## 二、架构分析

### 编辑器同步机制

本项目采用**纯 HTTP 防抖保存**，无实时协作：

```
Tiptap Editor
  → getHTML() → onChange
    → App setState (html)
      → useAutoSave (2s debounce)
        → saveDocumentContent
          → POST /blocks/batch (位置 diff)
```

核心特点：
- 编辑器操作的是**单一 HTML 字符串**，不持有服务器 blockId
- 保存时通过**位置索引 diff** 同步：编辑器第 N 个顶层节点 ↔ 服务器第 N 个 block
- 编辑器与服务器之间**无 blockId 映射**

### 服务器 Block 模型

```
Block {
  blockId, docId, type, payload: { html },
  parentId, sortKey, indent, collapsed
}
```

每个文档有 `rootBlockId`，API 返回树形结构，客户端拍平后按 `sortKey` 排序。

## 三、移动块方案决策

### 方案 A：服务器 API（`POST /blocks/:blockId/move`）

- 需要 blockId，但编辑器没有位置→ID 映射
- 需要计算新 sortKey
- 需要重新加载编辑器（闪屏）
- 接口只支持单块移动，交换需调两次

### 方案 B：编辑器层面交换（ProseMirror 事务）✅ 采用

- 即时 UI 反馈，无网络延迟
- 利用现有自动保存管道自动同步
- 实现简单，复用已有 ProseMirror API 模式

已知限制：
- 服务器端是"内容互换"而非"位置互换"（sortKey 不变，payload 交换）
- 视觉效果正确，但语义上与真实移动有差异
- 跨类型块交换可能出现类型-内容不匹配（边缘场景）

## 四、实现细节

### 4.1 组件结构

```
BlockToolbar/
  index.tsx        — 主组件：鼠标追踪、定位、状态管理
  BlockHandle.tsx  — 6-dot 手柄按钮
  BlockMenu.tsx    — antd Menu 操作菜单
  style.css        — 样式与动画
```

### 4.2 定位策略

工具栏作为 `.tiptap-editor-wrapper` 的子元素，`position: absolute`：

```
top  = block.getBoundingClientRect().top
     - wrapper.getBoundingClientRect().top
     + wrapper.scrollTop

left = wrapper.paddingLeft - 28  // 96 - 28 = 68px，padding 区域内
```

通过 React `ref` 传入 wrapper，不依赖 CSS `closest()`（ProseMirror 会插入额外 DOM 层导致查找失败）。

### 4.3 块节点检测

`mousemove` 时从 `event.target` 向上遍历，找到 `.tiptap-editor` 的直接子元素即为顶层块：

```
<strong> → <p> → .tiptap-editor ✓
```

### 4.4 显示/隐藏逻辑

| 事件 | 行为 |
|------|------|
| editor mousemove，新块 | 显示 handle |
| editor mousemove，同一块 | 不更新 |
| wrapper mouseleave | 200ms 后隐藏 |
| 菜单打开中 | 冻结 hover 状态 |

### 4.5 动画

**手柄移动**：
- 首次出现：无动画
- 块间切换：`transition: top 0.15s ease`

**菜单**：
- 三态管理：`closed → open → closing → closed`
- 打开：`scale(0.9→1)` + `opacity(0→1)`，从右上角缩放入场
- 关闭：`scale(1→0.9)` + `opacity(1→0)`，`onAnimationEnd` 后卸载

## 五、移动块实现

### 核心代码

```typescript
const swapBlocks = (direction: 'up' | 'down') => {
  const targetBlock = direction === 'up'
    ? hoveredBlock.previousElementSibling
    : hoveredBlock.nextElementSibling;

  // DOM → ProseMirror 位置
  const hoveredResolved = doc.resolve(view.posAtDOM(hoveredBlock, 0));
  const targetResolved = doc.resolve(view.posAtDOM(targetBlock, 0));

  // 获取块的精确范围
  const hStart = hoveredResolved.before(1);
  const hEnd   = hoveredResolved.after(1);
  const tStart = targetResolved.before(1);
  const tEnd   = targetResolved.after(1);

  // 排序：确保 earlier 在前
  const [sA, eA, sB, eB] = hStart < tStart
    ? [hStart, hEnd, tStart, tEnd]
    : [tStart, tEnd, hStart, hEnd];

  const nodeA = doc.nodeAt(sA);
  const nodeB = doc.nodeAt(sB);

  // 替换 [sA, eB] 为 [nodeB, nodeA]
  tr.replaceWith(sA, eB, [nodeB, nodeA]);
  view.dispatch(tr);
};
```

### 关键 ProseMirror API

| API | 作用 |
|-----|------|
| `view.posAtDOM(el, 0)` | DOM 元素 → 文档位置 |
| `doc.resolve(pos)` | 创建 ResolvedPos |
| `resolved.before(1)` | 顶层块起始位置 |
| `resolved.after(1)` | 顶层块结束位置 |
| `doc.nodeAt(pos)` | 获取节点 |
| `tr.replaceWith(s, e, nodes)` | 原子替换 |

### 踩坑记录

**坑 1：`posAtDOM` 返回块内部位置**

`view.posAtDOM(element, 0)` 返回的是块**内容**的位置（如文本起始），不是块节点本身。直接 `doc.nodeAt(pos)` 拿到文本节点，`replaceWith` 会把内容合并到同一段落。

解决：`doc.resolve(pos).before(1)` 回退到块节点起始。

**坑 2：手动 nodeSize 计算不可靠**

用 `nodeSize` 手动算结束位置可能因节点类型不对导致范围错误。

解决：用 `after(1)` 直接获取块结束位置。

### 禁用状态

- 最顶部块："上移"灰色（`!previousElementSibling`）
- 最底部块："下移"灰色（`!nextElementSibling`）

## 六、菜单项状态

| 功能 | Key | 状态 |
|------|-----|------|
| 删除 | `delete` | 占位 |
| 复制 | `copy` | 占位 |
| 剪切 | `cut` | 占位 |
| 清除格式 | `clear` | 占位 |
| 在上方添加 | `addAbove` | 占位 |
| 在下方添加 | `addBelow` | 占位 |
| 上移 | `moveUp` | ✅ 已实现 |
| 下移 | `moveDown` | ✅ 已实现 |

## 七、后续改进方向

### 7.1 拖拽移动块

通过 HTML5 Drag and Drop API 实现手柄拖拽：

- `BlockHandle` 加 `draggable` + `onDragStart`
- 编辑器 wrapper 监听 `dragover` / `drop`
- 拖拽中显示放置指示器（水平线）
- 放下时用 ProseMirror 事务移动块到目标位置

需要解决：
- 放置位置计算（鼠标 Y 与各块的相对关系）
- 指示器定位（需考虑 wrapper padding）
- 支持非相邻块的远距离移动

### 7.2 菜单功能接入

| 功能 | 实现方式 | 复杂度 |
|------|---------|--------|
| 删除 | `deleteSelection()` 或 ProseMirror 事务 | 低 |
| 复制 | 块 HTML → `navigator.clipboard` | 低 |
| 剪切 | 复制 + 删除 | 低 |
| 清除格式 | `unsetAllMarks().clearNodes()` | 低 |
| 上方/下方添加 | `insertContentAt(pos, { type: 'paragraph' })` | 中 |
| 块类型转换 | `toggleHeading`, `toggleBulletList` 等 | 低 |

### 7.3 块类型转换菜单

二级菜单，第一层选择目标类型：正文、H1-H6、列表、引用、代码块、高亮块。

## 八、注意事项

- `editor.view` 是 getter，未挂载时抛异常，需 `try/catch`
- 菜单打开期间冻结 hover，避免块切换导致跳动
- `wrapperRef` 直接传入，避免 `closest()` 失败
- 项目使用 `@ant-design/icons`，不用 `lucide-react`
