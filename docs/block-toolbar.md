# Block Toolbar — 块级浮动工具栏

## 概述

类似 Notion 的块级浮动工具栏：鼠标悬停到任意块左侧时出现 6-dot 拖拽手柄，点击弹出操作菜单，支持拖拽移动块位置。

## 架构背景

### 编辑器同步机制

本项目使用 **纯 HTTP 防抖保存**，没有实时协作（无 Y.js / WebSocket）：

```
Tiptap Editor → getHTML() → onChange → App setState → useAutoSave(2s) → saveDocumentContent → POST /blocks/batch
```

关键点：
- 编辑器操作的是**单一 HTML 字符串**，不是带有服务器 blockId 的独立节点
- `saveDocumentContent` 通过**位置索引**做 diff：编辑器第 N 个顶层 HTML 节点对应服务器第 N 个 block（按 sortKey 排序）
- 编辑器与服务器之间**没有 blockId 映射**

### 服务器 Block 模型

```typescript
interface Block {
  blockId: string;
  docId: string;
  type: string;           // "paragraph" | "heading" | "list" | "code" | ...
  payload: Record<string, unknown>;  // { html: string }
  parentId?: string;
  sortKey: string;        // 字符串排序
  indent: number;
  collapsed: boolean;
  children?: Block[];
}
```

## 移动块方案对比

### 方案 A：服务器 API（`POST /blocks/:blockId/move`）

```
用户点击 → 调用 API → 等待响应 → 重新加载编辑器
```

问题：
- 需要知道 blockId，但编辑器没有 ProseMirror 位置到 blockId 的映射
- 需要计算新的 sortKey
- 需要重新加载整个编辑器（闪屏）
- 移动接口只支持单个块，交换需要调用两次

### 方案 B：编辑器层面交换（ProseMirror API）✅ 采用

```
用户点击 → ProseMirror 事务交换两个节点 → 触发 onChange → 自动保存同步
```

优势：
- 即时 UI 反馈，无加载延迟
- 利用现有自动保存管道
- 实现简单

已知限制：
- 保存时位置 diff 会交换两个 block 的**内容**（不是交换 sortKey），语义上是"内容互换"而非"位置互换"
- 如果两个块类型不同（如 heading 和 paragraph），可能出现类型-内容不匹配
- 实际效果：视觉正确，服务器内容已交换，下次加载显示正确

## 设计细节

### 定位策略

编辑器 DOM 结构：

```
.tiptap-editor-wrapper          ← position: relative, padding: 80px 96px
  └── EditorContent (div)
      └── .tiptap-editor        ← ProseMirror view
          ├── <p>               ← 顶层块节点
          ├── <h1>
          ├── <ul>
          └── ...
```

工具栏作为 `.tiptap-editor-wrapper` 的子元素，使用 `position: absolute` 定位：

- **top** = `block.getBoundingClientRect().top - wrapper.getBoundingClientRect().top + wrapper.scrollTop`
- **left** = `wrapper.paddingLeft - 28`（即 96 - 28 = 68px，位于 padding 区域内）

不依赖 CSS `closest()` 查找 wrapper，而是通过 React `ref` 直接传入。

### 块节点检测

鼠标 `mousemove` 时，从 `event.target` 向上遍历 DOM，找到 ProseMirror 编辑器的**直接子元素**即为顶层块节点：

```
鼠标在 <strong> 上
  → <strong>.parentElement = <p>
    → <p>.parentElement = .tiptap-editor ✓  ← 这就是块节点
```

### 显示/隐藏逻辑

| 事件 | 行为 |
|------|------|
| editor `mousemove`，检测到新块 | 显示 handle，定位到该块 |
| editor `mousemove`，同一块 | 不更新 |
| wrapper `mouseleave`，鼠标离开整个编辑区域 | 200ms 后隐藏 |
| 菜单打开时 | 不切换 hover 的块，不触发隐藏 |

### 移动动画

- 首次出现（`null → block`）：直接定位，无动画
- 块间移动（`block A → block B`）：`transition: top 0.15s ease` 平滑滑动
- 消失：直接卸载 DOM

### 菜单动画

- 打开：`scale(0.9 → 1)` + `opacity(0 → 1)`，`transform-origin: top right`，从右上角缩放入场
- 关闭：`scale(1 → 0.9)` + `opacity(1 → 0)` 缩放退出，动画结束后才卸载 DOM（`onAnimationEnd`）

使用 `menuState: 'closed' | 'open' | 'closing'` 三态管理。

## 移动块实现

### 核心算法

通过 ProseMirror 事务交换两个相邻节点：

```typescript
const swapBlocks = (direction: 'up' | 'down') => {
  // 1. 找到目标块（上移取 previousElementSibling，下移取 nextElementSibling）
  const targetBlock = direction === 'up'
    ? hoveredBlock.previousElementSibling
    : hoveredBlock.nextElementSibling;

  // 2. 转换 DOM 元素为 ProseMirror 位置
  const hoveredResolved = doc.resolve(view.posAtDOM(hoveredBlock, 0));
  const targetResolved = doc.resolve(view.posAtDOM(targetBlock, 0));

  // 3. 获取块节点的精确范围
  const hoveredStart = hoveredResolved.before(1);  // 块起始
  const hoveredEnd = hoveredResolved.after(1);      // 块结束
  const targetStart = targetResolved.before(1);
  const targetEnd = targetResolved.after(1);

  // 4. 确保 earlier 在前，用 [后者, 前者] 替换整个范围
  const [startA, endA, startB, endB] = hoveredStart < targetStart
    ? [hoveredStart, hoveredEnd, targetStart, targetEnd]
    : [targetStart, targetEnd, hoveredStart, hoveredEnd];

  const nodeA = doc.nodeAt(startA);
  const nodeB = doc.nodeAt(startB);

  // 5. 替换 [startA, endB] 为 [nodeB, nodeA]
  tr.replaceWith(startA, endB, [nodeB, nodeA]);
  view.dispatch(tr);
};
```

### 关键 ProseMirror API

| API | 用途 |
|-----|------|
| `view.posAtDOM(domNode, 0)` | DOM 元素转 ProseMirror 文档位置 |
| `doc.resolve(pos)` | 创建 ResolvedPos |
| `resolvedPos.before(1)` | 获取顶层块节点起始位置 |
| `resolvedPos.after(1)` | 获取顶层块节点结束位置 |
| `doc.nodeAt(pos)` | 获取指定位置的节点 |
| `tr.replaceWith(start, end, nodes)` | 原子替换范围内容 |
| `view.dispatch(tr)` | 应用事务 |

### 位置计算踩坑记录

**坑 1：`posAtDOM` 返回的是块内部位置**

`view.posAtDOM(element, 0)` 返回的是块**内部内容**的位置（如段落里的文本起始处），不是块节点本身的位置。直接用 `doc.nodeAt(pos)` 会拿到文本节点而非段落节点，导致 `replaceWith` 把内容合并到同一个段落。

**解决**：用 `doc.resolve(pos).before(1)` 回退到块节点起始位置。

**坑 2：手动计算 nodeSize 不可靠**

用 `nodeSize` 手动计算结束位置（`startPos + nodeA.nodeSize + nodeB.nodeSize`）可能因为 `nodeAt` 返回的节点类型不对导致计算错误。

**解决**：用 `after(1)` 直接获取块节点结束位置，不依赖 `nodeSize`。

### 禁用状态

- 块在最顶部时"上移"灰色不可点（`!hoveredBlock.previousElementSibling`）
- 块在最底部时"下移"灰色不可点（`!hoveredBlock.nextElementSibling`）

## 文件结构

```
src/components/markdown-editor/BlockToolbar/
  index.tsx         ← 主组件：鼠标追踪、定位、状态管理
  BlockHandle.tsx   ← 6-dot 拖拽手柄按钮
  BlockMenu.tsx     ← antd Menu 封装的操作菜单（含移动块逻辑）
  style.css         ← 定位、动画、手柄样式
```

## 集成方式

```tsx
// MarkdownEditor.tsx
const wrapperRef = useRef<HTMLDivElement>(null);

<div ref={wrapperRef} className="tiptap-editor-wrapper">
  <EditorContent editor={editor} />
  {editable && <BlockToolbar wrapperRef={wrapperRef} />}
</div>
```

`BlockToolbar` 内部通过 `useMarkdownEditor()` 从 EditorContext 获取 editor 实例，不通过 props 传递。

## 菜单项

| 菜单项 | Key | 状态 |
|--------|-----|------|
| 删除 | `delete` | 占位 |
| 复制 | `copy` | 占位 |
| 剪切 | `cut` | 占位 |
| 清除格式 | `clear` | 占位 |
| 在上方添加 | `addAbove` | 占位 |
| 在下方添加 | `addBelow` | 占位 |
| 上移 | `moveUp` | ✅ 已实现 |
| 下移 | `moveDown` | ✅ 已实现 |

## 已注册的 Tiptap Extensions 清单

| Extension | 自定义命令 |
|-----------|-----------|
| StarterKit | `toggleHeading`, `toggleBulletList`, `toggleOrderedList`, `toggleBlockquote`, `undo`, `redo`, `setParagraph` |
| CodeBlock (Shiki) | `toggleCodeBlock`, `setCodeBlock`, `updateAttributes("codeBlock")` |
| Code / Bold / Italic / Strike / Underline | `toggleCode`, `toggleBold`, `toggleItalic`, `toggleStrike`, `toggleUnderline` |
| HorizontalRule | `setHorizontalRule` |
| TaskList + TaskItem | `toggleTaskList` |
| Link | `setLink`, `unsetLink` |
| TextStyle + Color | `setColor` |
| Highlight | `toggleHighlight` |
| TextAlign | `setTextAlign` |
| Table + Row + Cell + Header | `insertTable`, `addColumnAfter`, `addRowAfter` 等 |
| **FontSize** (自定义) | `setFontSize`, `unsetFontSize` |
| **LineHeight** (自定义) | `setLineHeight`, `unsetLineHeight` |
| **Indent** (自定义) | `indent`, `outdent` |
| **OrderedListStyle** (自定义) | `setOrderedListStyle`, `unsetOrderedListStyle` |
| **HighlightBlock** (自定义) | `insertHighlightBlock`, `updateHighlightBlockColor` |

## 后续改进

### 拖拽移动块（待实现）

通过 HTML5 Drag and Drop API 实现手柄拖拽移动块位置：

**核心思路**：
1. `BlockHandle` 添加 `draggable` 属性和 `onDragStart` 事件
2. 拖拽时在编辑器 wrapper 上监听 `dragover` / `drop` 事件
3. 拖拽过程中显示放置指示器（水平线）指示目标位置
4. 放下时用与 `swapBlocks` 相同的 ProseMirror 事务移动块

**需要解决的问题**：
- 确定放置位置：根据鼠标 Y 坐标与各块的相对位置判断插入到哪个块的上方或下方
- 放置指示器定位：绝对定位在 wrapper 内，需考虑 padding 偏移
- 拖拽预览：浏览器默认拖拽预览可能不理想，可自定义 `dataTransfer.setDragImage()`
- 跨块拖拽：当前 `swapBlocks` 只支持相邻块交换，拖拽需要支持任意位置移动

**实现方案**：
```typescript
// 伪代码
onDragStart: 记录源块 DOM 元素
onDragOver: 计算目标位置，显示指示器
onDrop: 获取源块和目标位置，执行移动事务
onDragEnd: 清理状态，隐藏指示器
```

### 其他菜单功能

| 功能 | 实现思路 | 复杂度 |
|------|---------|--------|
| 删除 | `editor.chain().focus().deleteSelection().run()` 或 ProseMirror 事务删除节点 | 低 |
| 复制 | 获取块 HTML，写入 `navigator.clipboard` | 低 |
| 剪切 | 复制 + 删除 | 低 |
| 清除格式 | `editor.chain().focus().unsetAllMarks().clearNodes().run()` | 低 |
| 在上方/下方添加 | `editor.chain().insertContentAt(pos, { type: 'paragraph' }).run()` | 中 |
| 块类型转换 | `toggleHeading`, `toggleBulletList` 等已有命令 | 低 |

### 块类型转换菜单

可以将当前菜单改为二级菜单，第一层选择目标类型，支持：
- 正文（Paragraph）
- 标题 H1-H6
- 无序列表 / 有序列表 / 待办列表
- 引用块
- 代码块
- 高亮块

## 注意事项

- `editor.view` 是 getter，未挂载时访问会抛异常，需用 `try/catch` 包裹
- 菜单打开期间冻结 hover 状态，避免块切换导致菜单位置跳动
- `wrapperRef` 直接传入避免 `closest()` 查找失败（ProseMirror 会插入额外 DOM 层）
- 项目使用 `@ant-design/icons`，不使用 `lucide-react`
- 复制/剪切/上移/下移等涉及 ProseMirror 底层操作，实现复杂度较高
