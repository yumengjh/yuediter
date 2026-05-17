'use client';

import { useState, useMemo } from 'react';
import { encodeDocId } from "@/lib/doc-slug";

const _raw = process.env.NEXT_PUBLIC_DOC_PATH || "/blog";
const DOC_PATH = _raw.startsWith("/") ? _raw : `/${_raw}`;
import { DocItem, WorkspaceInfo, UserInfo } from './page';

interface TreeDocItem extends DocItem {
  children: TreeDocItem[];
}

function buildTree(items: DocItem[]): TreeDocItem[] {
  const map = new Map<string, TreeDocItem>();
  const roots: TreeDocItem[] = [];

  // Sort items to maintain some order, e.g., by title or updatedAt
  const sortedItems = [...items].sort((a, b) => a.title.localeCompare(b.title));

  sortedItems.forEach(item => {
    map.set(item.docId, { ...item, children: [] });
  });

  sortedItems.forEach(item => {
    const node = map.get(item.docId)!;
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  if (date.getFullYear() === now.getFullYear()) {
    return `${month}-${day} ${hours}:${minutes}`;
  }
  return `${date.getFullYear()}-${month}-${day} ${hours}:${minutes}`;
}

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg 
    width="12" 
    height="12" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2.5" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ 
      transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
      transition: 'transform 0.2s ease',
      color: 'var(--app-text-muted)',
      marginRight: '4px'
    }}
  >
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const DocIcon = ({ icon }: { icon?: string }) => (
  <span className="tree-item-icon">{icon || '📄'}</span>
);

function TreeItem({ node, depth = 0 }: { node: TreeDocItem, depth?: number }) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  const handleToggle = (e: React.MouseEvent) => {
    if (hasChildren) {
      e.preventDefault();
      e.stopPropagation();
      setExpanded(!expanded);
    }
  };

  return (
    <div className="tree-node">
      <a 
        href={`${DOC_PATH}/${encodeDocId(node.docId)}`} 
        className="tree-item-row" 
        style={{ paddingLeft: `${depth * 24}px`, textDecoration: 'none', color: 'inherit' }}
      >
        <div className="tree-item-main">
          <div 
            className="tree-item-expander" 
            onClick={handleToggle}
          >
            {hasChildren && <ChevronIcon expanded={expanded} />}
          </div>
          <div className="tree-item-link">
            <DocIcon icon={node.icon} />
            <span className="tree-item-title">{node.title || '无标题'}</span>
          </div>
        </div>
        <div className="tree-item-spacer"></div>
        <div className="tree-item-date">{formatDate(node.updatedAt)}</div>
      </a>
      {expanded && hasChildren && (
        <div className="tree-children">
          {node.children.map(child => (
            <TreeItem key={child.docId} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PublicPageClient({ 
  workspace, 
  owner, 
  docs 
}: { 
  workspace: WorkspaceInfo, 
  owner: UserInfo | null, 
  docs: DocItem[] 
}) {
  const tree = useMemo(() => buildTree(docs), [docs]);

  return (
    <div className="public-container">
      <header className="kb-header">
        <div className="kb-header-top">
          <div className="kb-icon-wrapper">
            <span className="kb-icon">{workspace.icon || '📚'}</span>
          </div>
          <div className="kb-info">
            <h1 className="kb-title">{workspace.name}</h1>
            <div className="kb-meta">
              {owner && (
                <div className="kb-owner">
                  <img 
                    src={owner.avatar || 'https://gw.alipayobjects.com/zos/rmsportal/BiazfanxmamNRoxxVxka.png'} 
                    alt={owner.displayName || owner.username} 
                    className="kb-owner-avatar" 
                  />
                  <span className="kb-owner-name">{owner.displayName || owner.username}</span>
                </div>
              )}
              {owner && <span className="kb-meta-divider">·</span>}
              <div className="kb-stats">
                <span className="kb-stat-item">
                  <span className="kb-stat-value">{workspace.documentCount}</span>
                  <span className="kb-stat-label">文档</span>
                </span>
              </div>
            </div>
          </div>
        </div>
        
        {workspace.description && (
          <div className="kb-description-section">
            <div className="kb-description-header">
              <span className="kb-desc-emoji">👋</span>
              <span className="kb-desc-title">欢迎来到知识库</span>
            </div>
            <p className="kb-description-text">
              {workspace.description}
            </p>
          </div>
        )}
      </header>

      <main className="kb-content">
        {docs.length === 0 ? (
          <div className="public-empty">暂无已发布的文档</div>
        ) : (
          <div className="doc-tree">
            {tree.map(node => (
              <TreeItem key={node.docId} node={node} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
