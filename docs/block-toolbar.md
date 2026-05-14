# Block Toolbar — 块级浮动工具栏

## 概述

类似 Notion 的块级浮动工具栏：鼠标悬停到任意块左侧时出现 6-dot 拖拽手柄，点击弹出操作菜单。

## 设计思路

### 定位策略

编辑器的 DOM 结构：

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

## 文件结构

```
src/components/markdown-editor/BlockToolbar/
  index.tsx         ← 主组件：鼠标追踪、定位、状态管理
  BlockHandle.tsx   ← 6-dot 拖拽手柄按钮
  BlockMenu.tsx     ← antd Menu 封装的操作菜单
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

## 当前菜单项（console.log 占位）

| 菜单项 | Key | 状态 |
|--------|-----|------|
| 删除 | `delete` | 占位 |
| 复制 | `copy` | 占位 |
| 剪切 | `cut` | 占位 |
| 清除格式 | `clear` | 占位 |
| 在上方添加 | `addAbove` | 占位 |
| 在下方添加 | `addBelow` | 占位 |
| 上移 | `moveUp` | 占位 |
| 下移 | `moveDown` | 占位 |

## 可接入的 Editor 命令

编辑器已注册的全部 Tiptap extension 及其命令，均可通过 `editor.chain().focus().xxx().run()` 调用。

### 块类型转换

```ts
editor.chain().focus().setParagraph().run()                          // 正文
editor.chain().focus().toggleHeading({ level: 1|2|3|4|5|6 }).run()   // 标题 H1-H6
editor.chain().focus().toggleBulletList().run()                      // 无序列表
editor.chain().focus().toggleOrderedList().run()                     // 有序列表
editor.chain().focus().toggleTaskList().run()                        // 待办列表
editor.chain().focus().toggleBlockquote().run()                      // 引用块
editor.chain().focus().toggleCodeBlock().run()                       // 代码块
editor.chain().focus().insertHighlightBlock({ backgroundColor })     // 高亮块
```

### 块操作

```ts
editor.chain().focus().deleteSelection().run()                       // 删除选区/节点
editor.chain().focus().unsetAllMarks().clearNodes().run()            // 清除格式
editor.chain().focus().indent().run()                                // 增加缩进（最大 8 级）
editor.chain().focus().outdent().run()                               // 减少缩进
editor.chain().focus().insertContent('<p></p>').run()                // 插入内容
editor.chain().focus().setHorizontalRule().run()                     // 插入分割线
editor.chain().focus().insertTable({ rows, cols, withHeaderRow })    // 插入表格
```

### 行内格式

```ts
editor.chain().focus().toggleBold().run()                            // 加粗
editor.chain().focus().toggleItalic().run()                          // 斜体
editor.chain().focus().toggleStrike().run()                          // 删除线
editor.chain().focus().toggleUnderline().run()                       // 下划线
editor.chain().focus().toggleCode().run()                            // 行内代码
```

### 样式属性

```ts
editor.chain().focus().setColor(color).run()                         // 文字颜色
editor.chain().focus().toggleHighlight({ color }).run()              // 背景高亮
editor.chain().focus().setFontSize(size).run()                       // 字号
editor.chain().focus().setTextAlign("left"|"center"|"right").run()   // 对齐
editor.chain().focus().setLineHeight(value).run()                    // 行高
editor.chain().focus().unsetLineHeight().run()                       // 清除行高
```

### 链接

```ts
editor.chain().focus().extendMarkRange("link").setLink({ href })     // 设置链接
editor.chain().focus().extendMarkRange("link").unsetLink()           // 移除链接
```

### 属性更新

```ts
editor.chain().focus().updateAttributes("codeBlock", { language })           // 代码块语言
editor.chain().focus().updateAttributes("highlightBlock", { backgroundColor }) // 高亮块颜色
editor.chain().focus().setOrderedListStyle(listStyleType)                    // 有序列表样式
```

### 复杂操作（需要 ProseMirror API）

```ts
// 复制/剪切：需先选中整个块节点
const { $from } = editor.state.selection;
const node = $from.node(-1);  // 获取顶层块节点
const from = $from.before(-1);
const to = $from.after(-1);
// 然后使用 navigator.clipboard.writeText() 或 document.execCommand("copy")

// 上移/下移：需通过 Transaction 交换相邻节点
const tr = editor.state.tr;
// ... 交换 nodeA 和 nodeB 的位置
editor.view.dispatch(tr);

// 在上方/下方添加：定位块的前后 pos
const pos = $from.before(-1);  // 块前
// 或
const pos = $from.after(-1);   // 块后
editor.chain().insertContentAt(pos, { type: 'paragraph' }).run()
```

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

## 注意事项

- `editor.view` 是 getter，未挂载时访问会抛异常，需用 `try/catch` 包裹
- 菜单打开期间冻结 hover 状态，避免块切换导致菜单位置跳动
- `wrapperRef` 直接传入避免 `closest()` 查找失败（ProseMirror 会插入额外 DOM 层）
- 复制/剪切/上移/下移等涉及 ProseMirror 底层操作，实现复杂度较高，建议后续逐步接入
