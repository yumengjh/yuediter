import { useMemo, useCallback } from 'react';
import { Menu, message } from 'antd';
import type { MenuProps } from 'antd';
import {
  DeleteOutlined, CopyOutlined, ScissorOutlined,
  ArrowUpOutlined, ArrowDownOutlined, ClearOutlined, PlusCircleOutlined,
} from '@ant-design/icons';
import { useMarkdownEditor } from '../EditorContext';
import { loadDocumentContentV2 } from '../../../services/document';
import { useDocument } from '../../../contexts/DocumentContext';

interface BlockMenuProps {
  onClose: () => void;
  hoveredBlock: HTMLElement | null;
}

/** 通用：用 PM view 查询 DOM 元素对应的文档深度 */
function getPMDepth(
  el: HTMLElement,
  view: import('prosemirror-view').EditorView
): number {
  try {
    const $pos = view.state.doc.resolve(view.posAtDOM(el, 0));
    return $pos.depth;
  } catch {
    if (el.tagName === 'LI' || el.dataset.type === 'taskItem') return 2;
    return 1;
  }
}

/** 找到 el 在编辑器根下的顶层祖先 */
function getTopLevelAncestor(
  el: HTMLElement,
  editorDom: Element
): HTMLElement {
  let cur: HTMLElement = el;
  while (cur.parentElement && cur.parentElement !== editorDom) {
    cur = cur.parentElement;
  }
  return cur;
}

export function BlockMenu({ onClose, hoveredBlock }: BlockMenuProps) {
  const editor = useMarkdownEditor();
  const { currentDoc } = useDocument();

  const canMoveUp = useMemo(() => {
    if (!editor || !hoveredBlock) return false;
    const depth = getPMDepth(hoveredBlock, editor.view);
    const topLevel = getTopLevelAncestor(hoveredBlock, editor.view.dom);
    if (depth > 1) {
      return (
        hoveredBlock.previousElementSibling !== null ||
        topLevel.previousElementSibling !== null
      );
    }
    return topLevel.previousElementSibling !== null;
  }, [editor, hoveredBlock]);

  const canMoveDown = useMemo(() => {
    if (!editor || !hoveredBlock) return false;
    const depth = getPMDepth(hoveredBlock, editor.view);
    const topLevel = getTopLevelAncestor(hoveredBlock, editor.view.dom);
    if (depth > 1) {
      return (
        hoveredBlock.nextElementSibling !== null ||
        topLevel.nextElementSibling !== null
      );
    }
    return topLevel.nextElementSibling !== null;
  }, [editor, hoveredBlock]);

  const deleteBlock = useCallback(async () => {
    if (!editor || !hoveredBlock) return;
    const { view } = editor;
    const { doc } = view.state;
    const depth = getPMDepth(hoveredBlock, view);
    const blockId = hoveredBlock.dataset.blockId;

    const $pos = doc.resolve(view.posAtDOM(hoveredBlock, 0));
    const from = $pos.before(depth);
    const to = $pos.after(depth);

    if (depth > 1 && hoveredBlock.parentElement &&
        hoveredBlock.parentElement.children.length <= 1) {
      // 容器中最后一个子块 → 删除整个容器
      const $parent = doc.resolve(view.posAtDOM(hoveredBlock.parentElement, 0));
      const parentDepth = $parent.depth;
      view.dispatch(
        view.state.tr.delete($parent.before(parentDepth), $parent.after(parentDepth))
      );
    } else if (view.state.doc.childCount <= 1) {
      view.dispatch(
        view.state.tr
          .delete(0, doc.content.size)
          .insert(0, view.state.schema.nodes.paragraph.create())
      );
    } else {
      view.dispatch(view.state.tr.delete(from, to));
    }

    if (!currentDoc || !blockId) return;

    try {
      const { apiPost } = await import('../../../services/api-client');
      await apiPost('/blocks/batch', {
        docId: currentDoc.docId,
        operations: [{ type: 'delete', blockId }],
      });
    } catch (err) {
      console.error('[BlockMenu] 删除块失败:', err);
      message.error('删除失败，已恢复');
      try {
        const { content } = await loadDocumentContentV2(currentDoc.docId);
        editor.commands.setContent(content || '<p></p>', { emitUpdate: false });
      } catch {}
    }
  }, [editor, hoveredBlock, currentDoc]);

  const copyBlock = useCallback(async () => {
    if (!hoveredBlock) return;
    const html = hoveredBlock.outerHTML;
    const text = hoveredBlock.textContent || '';
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(text);
    }
  }, [hoveredBlock]);

  const clearFormat = useCallback(() => {
    if (!editor || !hoveredBlock) return;
    const { view } = editor;
    const { doc } = view.state;
    const depth = getPMDepth(hoveredBlock, view);
    const $pos = doc.resolve(view.posAtDOM(hoveredBlock, 0));
    const from = $pos.before(depth);
    const to = $pos.after(depth);
    const text = hoveredBlock.textContent || '';
    const paragraph = view.state.schema.nodes.paragraph.create(
      null, text ? view.state.schema.text(text) : undefined
    );
    view.dispatch(view.state.tr.replaceWith(from, to, paragraph));
  }, [editor, hoveredBlock]);

  const swapBlocks = useCallback((direction: 'up' | 'down') => {
    if (!editor || !hoveredBlock) return;
    const { view } = editor;
    const { state } = view;
    const { doc } = state;
    const depth = getPMDepth(hoveredBlock, view);
    const topLevel = getTopLevelAncestor(hoveredBlock, view.dom);

    // 子块：先尝试同级交换，再回落到顶层块交换
    if (depth > 1) {
      const sibling = (direction === 'up'
        ? hoveredBlock.previousElementSibling
        : hoveredBlock.nextElementSibling) as HTMLElement | null;

      if (sibling) {
        try {
          const hovStart = doc.resolve(view.posAtDOM(hoveredBlock, 0)).before(depth);
          const hovEnd   = doc.resolve(view.posAtDOM(hoveredBlock, 0)).after(depth);
          const sibStart = doc.resolve(view.posAtDOM(sibling, 0)).before(depth);
          const sibEnd   = doc.resolve(view.posAtDOM(sibling, 0)).after(depth);

          const [startA, endA, startB, endB] = hovStart < sibStart
            ? [hovStart, hovEnd, sibStart, sibEnd]
            : [sibStart, sibEnd, hovStart, hovEnd];

          const nodeA = doc.nodeAt(startA);
          const nodeB = doc.nodeAt(startB);
          if (nodeA && nodeB) {
            view.dispatch(state.tr.replaceWith(startA, endB, [nodeB, nodeA]));
            return;
          }
        } catch (err) {
          console.error('[BlockMenu] 子块移动失败:', err);
        }
      }
    }

    // 顶层块交换（包括 depth>1 但同级无更多项时的回落）
    const targetTop = (direction === 'up'
      ? topLevel.previousElementSibling
      : topLevel.nextElementSibling) as HTMLElement | null;
    if (!targetTop) return;

    try {
      const hovStart = doc.resolve(view.posAtDOM(topLevel, 0)).before(1);
      const hovEnd   = doc.resolve(view.posAtDOM(topLevel, 0)).after(1);
      const tgtStart = doc.resolve(view.posAtDOM(targetTop, 0)).before(1);
      const tgtEnd   = doc.resolve(view.posAtDOM(targetTop, 0)).after(1);

      const [startA, endA, startB, endB] = hovStart < tgtStart
        ? [hovStart, hovEnd, tgtStart, tgtEnd]
        : [tgtStart, tgtEnd, hovStart, hovEnd];

      const nodeA = doc.nodeAt(startA);
      const nodeB = doc.nodeAt(startB);
      if (nodeA && nodeB) {
        view.dispatch(state.tr.replaceWith(startA, endB, [nodeB, nodeA]));
      }
    } catch (err) {
      console.error('[BlockMenu] 顶层块移动失败:', err);
    }
  }, [editor, hoveredBlock]);

  const items: MenuProps['items'] = useMemo(() => [
    { key: 'delete',   icon: <DeleteOutlined />,     label: '删除' },
    { key: 'copy',     icon: <CopyOutlined />,       label: '复制' },
    { key: 'cut',      icon: <ScissorOutlined />,    label: '剪切' },
    { type: 'divider' },
    { key: 'clear',    icon: <ClearOutlined />,      label: '清除格式' },
    { type: 'divider' },
    { key: 'addAbove', icon: <PlusCircleOutlined />, label: '在上方添加' },
    { key: 'addBelow', icon: <PlusCircleOutlined />, label: '在下方添加' },
    { type: 'divider' },
    { key: 'moveUp',   icon: <ArrowUpOutlined />,    label: '上移',  disabled: !canMoveUp },
    { key: 'moveDown', icon: <ArrowDownOutlined />,  label: '下移',  disabled: !canMoveDown },
  ], [canMoveUp, canMoveDown]);

  const handleClick: MenuProps['onClick'] = useCallback(({ key }: { key: string }) => {
    switch (key) {
      case 'delete':   deleteBlock(); break;
      case 'copy':     copyBlock(); break;
      case 'cut':      copyBlock().then(() => deleteBlock()); break;
      case 'clear':    clearFormat(); break;
      case 'moveUp':   swapBlocks('up'); break;
      case 'moveDown': swapBlocks('down'); break;
      default: console.log(`[BlockMenu] 点击: ${key}`);
    }
    onClose();
  }, [deleteBlock, copyBlock, clearFormat, swapBlocks, onClose]);

  return (
    <div className="block-menu-popover">
      <Menu
        items={items}
        onClick={handleClick}
        selectable={false}
        style={{ border: 'none', borderRadius: 6 }}
      />
    </div>
  );
}