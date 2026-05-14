import { useEffect, useState, useCallback, useRef } from 'react';
import { useMarkdownEditor } from '../EditorContext';
import { BlockHandle } from './BlockHandle';
import { BlockMenu } from './BlockMenu';
import './style.css';

interface BlockToolbarProps {
  wrapperRef: React.RefObject<HTMLDivElement | null>;
}

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

  if (!editor || !ready || !hoveredBlock) return null;

  return (
    <div
      className={`block-handle-wrapper${shouldAnimate ? ' block-handle-wrapper--animate' : ''}`}
      style={{ top: position.top, left: position.left }}
      onMouseEnter={handleKeepVisible}
    >
      <BlockHandle onClick={() => menuState === 'open' ? closeMenu() : openMenu()} />
      {menuVisible && (
        <div
          ref={menuAnchorRef}
          className={`block-menu-anchor${menuState === 'closing' ? ' block-menu-anchor--closing' : ''}`}
          onAnimationEnd={() => {
            if (menuState === 'closing') setMenuState('closed');
          }}
        >
          <BlockMenu onClose={closeMenu} />
        </div>
      )}
    </div>
  );
}
