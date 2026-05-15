import { useEffect, useState, useCallback, useRef } from 'react';
import { useMarkdownEditor } from '../EditorContext';
import { BlockHandle } from './BlockHandle';
import { BlockMenu } from './BlockMenu';
import './style.css';

interface BlockToolbarProps {
  wrapperRef: React.RefObject<HTMLDivElement | null>;
}

const DRAG_THRESHOLD = 3;
const AUTO_SCROLL_ZONE = 40;
const AUTO_SCROLL_MAX_SPEED = 12;
const GHOST_OFFSET_X = 12;
const GHOST_OFFSET_Y = 6;

export default function BlockToolbar({ wrapperRef }: BlockToolbarProps) {
  const editor = useMarkdownEditor();
  const [hoveredBlock, setHoveredBlock] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [menuState, setMenuState] = useState<'closed' | 'open' | 'closing'>('closed');
  const [ready, setReady] = useState(false);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuAnchorRef = useRef<HTMLDivElement>(null);
  const prevBlockRef = useRef<HTMLElement | null>(null);

  // ---- Drag refs ----
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragSourceRef = useRef<HTMLElement | null>(null);
  const ghostElementRef = useRef<HTMLElement | null>(null);
  const dropIndicatorRef = useRef<HTMLElement | null>(null);
  const blockElementsRef = useRef<HTMLElement[]>([]);
  const sourceIndexRef = useRef(-1);
  const animationFrameRef = useRef<number | null>(null);
  const dropTargetIndexRef = useRef(-1);
  const isDraggingActiveRef = useRef(false);
  const justDraggedRef = useRef(false);

  const openMenu = useCallback(() => setMenuState('open'), []);
  const closeMenu = useCallback(() => setMenuState('closing'), []);
  const menuVisible = menuState !== 'closed';

  const getEditorDom = useCallback((): HTMLElement | null => {
    try { return editor?.view.dom ?? null; } catch { return null; }
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    let retryId: ReturnType<typeof setTimeout> | null = null;
    const tryMount = () => {
      try {
        if (editor.view.dom) { setReady(true); return; }
      } catch {}
      retryId = setTimeout(tryMount, 50);
    };
    tryMount();
    return () => { if (retryId) clearTimeout(retryId); };
  }, [editor]);

  // 块切换时：从 null → block 不动画，block → block 动画
  useEffect(() => {
    if (hoveredBlock && prevBlockRef.current && prevBlockRef.current !== hoveredBlock) {
      setShouldAnimate(true);
    } else {
      setShouldAnimate(false);
    }
    prevBlockRef.current = hoveredBlock;
  }, [hoveredBlock]);

  const findBlockNode = useCallback((element: HTMLElement | null): HTMLElement | null => {
    if (!element) return null;
    let current: HTMLElement | null = element;
    const editorElement = getEditorDom();
    if (!editorElement) return null;
    while (current && current !== editorElement) {
      if (current.parentElement === editorElement) return current;
      current = current.parentElement;
    }
    return null;
  }, [getEditorDom]);

  const updatePosition = useCallback((block: HTMLElement) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const blockRect = block.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const paddingLeft = parseFloat(getComputedStyle(wrapper).paddingLeft);
    setPosition({
      top: blockRect.top - wrapperRect.top + wrapper.scrollTop,
      left: paddingLeft - 28
    });
  }, [wrapperRef]);

  useEffect(() => {
    if (!ready) return;
    const editorElement = getEditorDom();
    const wrapper = wrapperRef.current;
    if (!editorElement || !wrapper) return;

    const handleEditorMouseMove = (e: MouseEvent) => {
      if (isDraggingActiveRef.current) return;
      if (menuVisible) return;
      const block = findBlockNode(e.target as HTMLElement);
      if (block && block !== hoveredBlock) {
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
        }
        setHoveredBlock(block);
        updatePosition(block);
      }
    };

    const handleWrapperMouseLeave = (e: MouseEvent) => {
      if (isDraggingActiveRef.current) return;
      if (menuVisible) return;
      const related = e.relatedTarget as HTMLElement | null;
      if (!related || !wrapper.contains(related)) {
        hideTimeoutRef.current = setTimeout(() => setHoveredBlock(null), 200);
      }
    };

    editorElement.addEventListener('mousemove', handleEditorMouseMove);
    wrapper.addEventListener('mouseleave', handleWrapperMouseLeave);

    return () => {
      editorElement.removeEventListener('mousemove', handleEditorMouseMove);
      wrapper.removeEventListener('mouseleave', handleWrapperMouseLeave);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [ready, getEditorDom, findBlockNode, updatePosition, hoveredBlock, wrapperRef, menuVisible]);

  const handleKeepVisible = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menuVisible) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.block-menu-popover') && !target.closest('.block-handle__btn')) {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuVisible, closeMenu]);

  // ---- Drag: move block via ProseMirror delete + insert ----
  const moveBlock = useCallback((targetGapIndex: number) => {
    if (!editor) return;
    try {
      const { view } = editor;
      const { doc } = view.state;
      const allBlockEls = Array.from(view.dom.children) as HTMLElement[];
      const sourceIdx = sourceIndexRef.current;
      if (sourceIdx < 0 || sourceIdx >= allBlockEls.length) return;

      // 跳过无意义的移动（位置不变）
      if (targetGapIndex === sourceIdx || targetGapIndex === sourceIdx + 1) return;

      const sourceBlock = allBlockEls[sourceIdx];

      // 获取源块的 ProseMirror 位置
      const $source = doc.resolve(view.posAtDOM(sourceBlock, 0));
      const sourceStart = $source.before(1);
      const sourceEnd = $source.after(1);
      const sourceNode = doc.nodeAt(sourceStart);
      if (!sourceNode) return;

      // 计算插入位置：在目标 gap 位置之前
      let insertPos: number;
      if (targetGapIndex >= allBlockEls.length) {
        const $last = doc.resolve(view.posAtDOM(allBlockEls[allBlockEls.length - 1], 0));
        insertPos = $last.after(1);
      } else if (targetGapIndex <= 0) {
        const $first = doc.resolve(view.posAtDOM(allBlockEls[0], 0));
        insertPos = $first.before(1);
      } else {
        const $target = doc.resolve(view.posAtDOM(allBlockEls[targetGapIndex], 0));
        insertPos = $target.before(1);
      }

      // 两步事务：先删后插，用 mapping.mapPos 确保位置正确
      const tr = view.state.tr;
      tr.delete(sourceStart, sourceEnd);
      const mappedPos = tr.mapping.map(insertPos);
      tr.insert(mappedPos, sourceNode);
      view.dispatch(tr);
    } catch (err) {
      console.error('[BlockToolbar] 移动块失败:', err);
    }
  }, [editor]);

  // ---- Drag: ghost & indicator management ----
  const createGhost = useCallback((sourceBlock: HTMLElement) => {
    const ghost = sourceBlock.cloneNode(true) as HTMLElement;
    ghost.className = 'block-drag-ghost';
    ghost.style.width = sourceBlock.offsetWidth + 'px';
    document.body.appendChild(ghost);
    ghostElementRef.current = ghost;
  }, []);

  const createDropIndicator = useCallback(() => {
    const indicator = document.createElement('div');
    indicator.className = 'drop-indicator';
    indicator.style.display = 'none';
    document.body.appendChild(indicator);
    dropIndicatorRef.current = indicator;
  }, []);

  const updateDragVisuals = useCallback((clientX: number, clientY: number) => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const wrapperRect = wrapper.getBoundingClientRect();

    // 更新幽灵位置（position: fixed，直接用 viewport 坐标）
    const ghost = ghostElementRef.current;
    if (ghost) {
      ghost.style.left = (clientX + GHOST_OFFSET_X) + 'px';
      ghost.style.top = (clientY + GHOST_OFFSET_Y) + 'px';
    }

    // 自动滚动
    const distFromTop = clientY - wrapperRect.top;
    const distFromBottom = wrapperRect.bottom - clientY;
    if (distFromTop < AUTO_SCROLL_ZONE && distFromTop >= 0) {
      const speed = Math.ceil(AUTO_SCROLL_MAX_SPEED * (1 - distFromTop / AUTO_SCROLL_ZONE));
      wrapper.scrollBy({ top: -speed, behavior: 'auto' });
    } else if (distFromBottom < AUTO_SCROLL_ZONE && distFromBottom >= 0) {
      const speed = Math.ceil(AUTO_SCROLL_MAX_SPEED * (1 - distFromBottom / AUTO_SCROLL_ZONE));
      wrapper.scrollBy({ top: speed, behavior: 'auto' });
    }

    // 计算放置目标
    const blocks = blockElementsRef.current;
    const sourceIdx = sourceIndexRef.current;

    // 光标不在编辑器区域内 → 隐藏指示线
    if (clientY < wrapperRect.top || clientY > wrapperRect.bottom || blocks.length <= 1) {
      dropTargetIndexRef.current = -1;
      const indicator = dropIndicatorRef.current;
      if (indicator) indicator.style.display = 'none';
      return;
    }

    // 重新读取块位置（随滚动更新）
    let bestGap = -1;
    let bestDist = Infinity;
    let bestViewportY = 0;

    for (let i = 0; i <= blocks.length; i++) {
      // 跳过源块相邻的间隙（移动无意义）
      if (i === sourceIdx || i === sourceIdx + 1) continue;

      let gapViewportY: number;
      if (i === 0) {
        const rect = blocks[0].getBoundingClientRect();
        gapViewportY = rect.top;
      } else if (i === blocks.length) {
        const rect = blocks[blocks.length - 1].getBoundingClientRect();
        gapViewportY = rect.bottom;
      } else {
        const prevRect = blocks[i - 1].getBoundingClientRect();
        const nextRect = blocks[i].getBoundingClientRect();
        gapViewportY = (prevRect.bottom + nextRect.top) / 2;
      }

      const dist = Math.abs(clientY - gapViewportY);
      if (dist < bestDist) {
        bestDist = dist;
        bestGap = i;
        bestViewportY = gapViewportY;
      }
    }

    if (bestGap >= 0) {
      dropTargetIndexRef.current = bestGap;
      const indicator = dropIndicatorRef.current;
      if (indicator) {
        indicator.style.display = '';
        indicator.style.top = bestViewportY + 'px';
        indicator.style.left = wrapperRect.left + 'px';
        indicator.style.width = wrapperRect.width + 'px';
      }
    } else {
      dropTargetIndexRef.current = -1;
    }
  }, [wrapperRef]);

  const cleanupDrag = useCallback(() => {
    // 移除幽灵
    ghostElementRef.current?.remove();
    ghostElementRef.current = null;
    // 移除指示线
    dropIndicatorRef.current?.remove();
    dropIndicatorRef.current = null;
    // 恢复 body
    document.body.classList.remove('block-dragging');
    // 恢复源块
    if (dragSourceRef.current) {
      dragSourceRef.current.style.opacity = '';
    }
    // 清理 rAF
    if (animationFrameRef.current != null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    // 重置 refs
    isDraggingRef.current = false;
    isDraggingActiveRef.current = false;
    dragStartRef.current = null;
    dragSourceRef.current = null;
    blockElementsRef.current = [];
    sourceIndexRef.current = -1;
    dropTargetIndexRef.current = -1;
  }, []);

  // ---- Drag: mousedown handler ----
  const handleHandleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); // 防止 ProseMirror 文本选择
    if (!hoveredBlock || !editor) return;

    dragStartRef.current = { x: e.clientX, y: e.clientY };
    dragSourceRef.current = hoveredBlock;

    const onMouseMove = (me: MouseEvent) => {
      const start = dragStartRef.current;
      if (!start) return;

      if (!isDraggingRef.current) {
        const dx = me.clientX - start.x;
        const dy = me.clientY - start.y;
        if (Math.sqrt(dx * dx + dy * dy) <= DRAG_THRESHOLD) return;

        // 开始拖拽
        isDraggingRef.current = true;
        isDraggingActiveRef.current = true;

        // 关闭菜单
        setMenuState('closed');

        // 缓存所有块元素
        const blocks = Array.from(editor.view.dom.children) as HTMLElement[];
        blockElementsRef.current = blocks;
        sourceIndexRef.current = blocks.indexOf(dragSourceRef.current!);

        // 创建幽灵和指示线
        if (dragSourceRef.current) {
          createGhost(dragSourceRef.current);
          createDropIndicator();
          dragSourceRef.current.style.opacity = '0.3';
        }

        document.body.classList.add('block-dragging');
      }

      // rAF 节流更新视觉
      if (animationFrameRef.current != null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(() => {
        updateDragVisuals(me.clientX, me.clientY);
      });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      if (isDraggingRef.current) {
        const targetIdx = dropTargetIndexRef.current;
        if (targetIdx >= 0) {
          moveBlock(targetIdx);
        }
        cleanupDrag();
        justDraggedRef.current = true;
      } else {
        dragStartRef.current = null;
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [hoveredBlock, editor, createGhost, createDropIndicator, updateDragVisuals, moveBlock, cleanupDrag]);

  const handleHandleClick = useCallback(() => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    menuState === 'open' ? closeMenu() : openMenu();
  }, [menuState, closeMenu, openMenu]);

  // 拖拽结束时确保恢复
  useEffect(() => {
    return () => {
      if (isDraggingRef.current) {
        cleanupDrag();
      }
    };
  }, [cleanupDrag]);

  if (!editor || !ready || !hoveredBlock) return null;

  return (
    <div
      className={`block-handle-wrapper${shouldAnimate ? ' block-handle-wrapper--animate' : ''}`}
      style={{ top: position.top, left: position.left }}
      onMouseEnter={handleKeepVisible}
    >
      <BlockHandle onClick={handleHandleClick} onMouseDown={handleHandleMouseDown} />
      {menuVisible && (
        <div
          ref={menuAnchorRef}
          className={`block-menu-anchor${menuState === 'closing' ? ' block-menu-anchor--closing' : ''}`}
          onAnimationEnd={() => {
            if (menuState === 'closing') setMenuState('closed');
          }}
        >
          <BlockMenu onClose={closeMenu} hoveredBlock={hoveredBlock} />
        </div>
      )}
    </div>
  );
}
