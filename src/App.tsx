import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import TurndownService from "turndown";
import { MarkdownEditor } from "./components/markdown-editor";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import {
  DocumentProvider,
  useDocument,
} from "./contexts/DocumentContext";
import { SetupModal } from "./components/SetupModal";
import { DocumentHeader } from "./components/DocumentHeader";
import { useAutoSave } from "./hooks/useAutoSave";
import { commitVersion } from "./services/document";
import "./App.css";

// ─── Turndown 配置（保留原有逻辑） ───

function createTurndownService(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    strongDelimiter: "**",
  });

  td.addRule("horizontalRule", {
    filter: "hr",
    replacement: () => "\n\n---\n\n",
  });

  td.addRule("styledSpan", {
    filter: (node) => {
      if (node.nodeName !== "SPAN") return false;
      const el = node as HTMLElement;
      return !!(el.style?.fontSize || el.style?.color || el.style?.backgroundColor);
    },
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const styles: string[] = [];
      if (el.style.fontSize) styles.push(`font-size: ${el.style.fontSize}`);
      if (el.style.color) styles.push(`color: ${el.style.color}`);
      if (el.style.backgroundColor) styles.push(`background-color: ${el.style.backgroundColor}`);
      const inner = node.textContent || "";
      if (!styles.length) return inner;
      return `<span style="${styles.join("; ")}">${inner}</span>`;
    },
  });

  td.addRule("underline", {
    filter: "u",
    replacement: (content) => `<u>${content}</u>`,
  });

  td.addRule("highlight", {
    filter: (node) => {
      if (node.nodeName !== "MARK") return false;
      const el = node as HTMLElement;
      return !!(el.style?.backgroundColor && el.style.backgroundColor !== "yellow");
    },
    replacement: (content, node) => {
      const el = node as HTMLElement;
      const bg = el.style.backgroundColor;
      return `<mark style="background-color: ${bg}">${content}</mark>`;
    },
  });

  function rgbToHex(rgb: string): string {
    if (rgb.startsWith("#")) return rgb;
    const match = rgb.match(/\d+/g);
    if (!match || match.length < 3) return "";
    const r = parseInt(match[0]).toString(16).padStart(2, "0");
    const g = parseInt(match[1]).toString(16).padStart(2, "0");
    const b = parseInt(match[2]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`.toUpperCase();
  }

  const highlightBlockColorTypeMap: Record<string, string> = {
    "#FFF2CC": "tip",
    "#FCE5CD": "warning",
    "#F4CCCC": "danger",
    "#E6B8AF": "caution",
    "#D9EAD3": "success",
    "#D0E0E3": "info",
    "#C9DAF8": "note",
    "#CFE2F3": "question",
    "#D9D2E9": "example",
    "#EAD1DC": "quote",
  };

  td.addRule("highlightBlock", {
    filter: (node) => {
      return (
        node.nodeName === "DIV" &&
        (node as HTMLElement).hasAttribute("data-highlight-block")
      );
    },
    replacement: (content, node) => {
      const el = node as HTMLElement;
      const bg = rgbToHex(el.style.backgroundColor);
      const trimmed = content.trim();
      const type = highlightBlockColorTypeMap[bg] || "tip";
      return `\n\n::: ${type}\n${trimmed}\n:::\n\n`;
    },
  });

  td.addRule("textAlign", {
    filter: (node) => {
      const el = node as HTMLElement;
      if (!el.style?.textAlign) return false;
      return ["P", "H1", "H2", "H3", "H4", "H5", "H6", "DIV", "BLOCKQUOTE"].includes(
        node.nodeName,
      );
    },
    replacement: (content, node) => {
      const el = node as HTMLElement;
      const tag = node.nodeName.toLowerCase();
      const align = el.style.textAlign;
      if (/^h[1-6]$/.test(tag)) {
        const level = Number(tag[1]);
        const hashes = "#".repeat(level);
        return `<div style="text-align: ${align}">\n\n${hashes} ${content.trim()}\n\n</div>`;
      }
      if (tag === "p") {
        return `<p style="text-align: ${align}">${content}</p>`;
      }
      return `<${tag} style="text-align: ${align}">${content}</${tag}>`;
    },
  });

  td.addRule("lineHeight", {
    filter: (node) => {
      const el = node as HTMLElement;
      if (!el.style?.lineHeight) return false;
      return ["P", "H1", "H2", "H3", "H4", "H5", "H6"].includes(node.nodeName);
    },
    replacement: (content, node) => {
      const el = node as HTMLElement;
      const tag = node.nodeName.toLowerCase();
      const lh = el.style.lineHeight;
      return `<${tag} style="line-height: ${lh}">${content}</${tag}>`;
    },
  });

  td.addRule("taskListItem", {
    filter: (node) => {
      return node.nodeName === "LI" && !!(node as HTMLElement).querySelector('input[type="checkbox"]');
    },
    replacement: (content, node) => {
      const checkbox = (node as HTMLElement).querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      const checked = checkbox?.checked ? "x" : " ";
      const clean = content.replace(/^\s*\[[ x]\]\s*/, "").replace(/^\s+/, "").trim();
      return `- [${checked}] ${clean}\n`;
    },
  });

  td.addRule("tableWrapper", {
    filter: (node) => {
      return node.nodeName === "DIV" && (node as HTMLElement).classList.contains("tableWrapper");
    },
    replacement: (content) => content,
  });

  td.addRule("table", {
    filter: "table",
    replacement: (_content, tableNode) => {
      const table = tableNode as HTMLTableElement;
      const rows = Array.from(table.querySelectorAll("tr"));
      if (rows.length === 0) return "";

      const cellText = (cell: Element): string => {
        let md = "";
        cell.childNodes.forEach((child) => {
          if (child.nodeType === Node.TEXT_NODE) {
            md += child.textContent || "";
          } else if (child.nodeType === Node.ELEMENT_NODE) {
            md += td.turndown((child as HTMLElement).outerHTML);
          }
        });
        return md.replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
      };

      const parseRow = (tr: Element): string[] =>
        Array.from(tr.querySelectorAll("th, td")).map(cellText);

      const isHeader = (tr: Element, idx: number): boolean => {
        if (tr.querySelector("th")) return true;
        const parent = tr.parentElement;
        return !!parent && parent.nodeName === "THEAD";
      };

      const dataRows = rows.map((tr, i) => ({ cells: parseRow(tr), header: isHeader(tr, i) }));

      const maxCols = Math.max(...dataRows.map((r) => r.cells.length), 1);
      const pad = (arr: string[]): string[] => {
        while (arr.length < maxCols) arr.push("");
        return arr;
      };

      const headerIdx = dataRows.findIndex((r) => r.header);
      const headerRow = headerIdx >= 0 ? dataRows[headerIdx] : dataRows[0];
      const bodyRows = dataRows.filter((_, i) => i !== (headerIdx >= 0 ? headerIdx : 0));

      const headerCells = pad([...headerRow.cells]);
      const separator = headerCells.map(() => "---");
      const bodyLines = bodyRows.map((r) => pad([...r.cells]));

      const toLine = (cells: string[]) => `| ${cells.join(" | ")} |`;
      return `\n${[toLine(headerCells), toLine(separator), ...bodyLines.map(toLine)].join("\n")}\n`;
    },
  });

  return td;
}

const turndownService = createTurndownService();

function htmlToMarkdown(html: string): string {
  if (!html) return "";
  return turndownService.turndown(html).trim();
}

type OutputTab = "html" | "markdown";

// ─── 编辑器主内容区 ───

const DEFAULT_CONTENT = `<h2>欢迎使用 Markdown 增强型富文本编辑器</h2>
<p>这是一款 <strong>所见即所得</strong> 的现代化编辑器，基于 TipTap 构建，融合 Markdown 简洁性与富文本强大能力，支持所有常用排版与内容格式：</p>
<ul>
  <li>六级标题（H1 - H6）自动排版与目录结构</li>
  <li>加粗、斜体、下划线、删除线、字体颜色、背景高亮</li>
  <li>有序列表 / 无序列表（支持多前缀样式）</li>
  <li>待办事项清单、段落对齐、行高、缩进调整</li>
  <li>代码块 / 行内代码（支持主流编程语言语法高亮）</li>
  <li>引用块、高亮提示块、分割线、表格、链接、图片</li>
  <li>撤销 / 重做、清除格式、格式刷一键复用样式</li>
</ul>
<blockquote><p>无需记忆复杂语法，点击工具栏即可完成专业排版，适用于笔记、文档、技术文章、报告等多种场景。</p></blockquote>
<pre><code class="language-typescript">// 快速体验：选中文字 → 使用工具栏格式化
const editor = "现代化富文本编辑器";
console.log("欢迎使用", editor);
</code></pre>
<p>开始你的创作吧 ↓</p>`;


function EditorContent() {
  const { isAuthenticated: authed } = useAuth();
  const { currentDoc, loadContent, saveDoc, workspaceId, setWorkspace } =
    useDocument();
  const [html, setHtml] = useState(DEFAULT_CONTENT);
  const [activeTab, setActiveTab] = useState<OutputTab>("markdown");
  const [setupOpen, setSetupOpen] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [outputModalOpen, setOutputModalOpen] = useState(false);
  const [showTOC, setShowTOC] = useState(false);
  // 追踪已加载的文档 ID，避免重复加载
  const loadedDocIdRef = useRef<string | null>(null);

  // 检查是否需要显示设置弹窗
  useEffect(() => {
    setSetupOpen(!authed || !workspaceId);
  }, [authed, workspaceId]);

  // 当 currentDoc 变化时加载内容
  useEffect(() => {
    const docId = currentDoc?.docId;
    if (!docId) {
      setHtml(DEFAULT_CONTENT);
      loadedDocIdRef.current = null;
      return;
    }
    // 同一文档已加载，跳过
    if (loadedDocIdRef.current === docId) return;

    loadedDocIdRef.current = docId;
    setLoadingDoc(true);
    loadContent(docId)
      .then((content) => {
        setHtml(content || DEFAULT_CONTENT);
      })
      .catch(() => {
        setHtml(DEFAULT_CONTENT);
        loadedDocIdRef.current = null; // 允许重试
      })
      .finally(() => {
        setLoadingDoc(false);
      });
  }, [currentDoc, loadContent]);

  // 自动保存：文档加载期间禁用
  useAutoSave(html, saveDoc, { delay: 2000, enabled: !loadingDoc });

  // 手动保存：先保存内容，再提交版本
  const handleManualSave = useCallback(async () => {
    try {
      await saveDoc(html);
      if (currentDoc) {
        await commitVersion(currentDoc.docId, "手动保存");
      }
    } catch (e) {
      console.error("手动保存失败:", e);
    }
  }, [saveDoc, html, currentDoc]);

  const handleSetupComplete = useCallback(
    (wsId: string) => {
      setWorkspace(wsId);
      setSetupOpen(false);
    },
    [setWorkspace],
  );

  const markdown = useMemo(() => htmlToMarkdown(html), [html]);
  const outputContent = activeTab === "html" ? html : markdown;
  const copyLabel = activeTab === "html" ? "复制 HTML" : "复制 Markdown";

  return (
    <>
      <SetupModal open={setupOpen} onComplete={handleSetupComplete} />

      {authed && workspaceId && (
        <>
          <DocumentHeader 
            onSave={handleManualSave} 
            showTOC={showTOC} 
            onToggleTOC={setShowTOC} 
          />
          <div className="output-card">
            <MarkdownEditor
              content={html}
              onChange={setHtml}
              placeholder="开始记录你的知识吧…"
              showTOC={showTOC}
              onTOCToggle={setShowTOC}
              loading={loadingDoc}
            />
          </div>

          {/* 输出按钮 - 右上角 */}
          <button
            className="output-trigger-btn"
            onClick={() => setOutputModalOpen(true)}
            title="查看 HTML / Markdown"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            <span>输出</span>
          </button>

          {/* 输出弹窗 */}
          {outputModalOpen && (
            <div className="output-modal-overlay" onClick={() => setOutputModalOpen(false)}>
              <div className="output-modal" onClick={(e) => e.stopPropagation()}>
                <div className="output-modal-header">
                  <div className="output-tab-bar">
                    <button
                      className={`output-tab ${activeTab === "markdown" ? "output-tab--active" : "output-tab--inactive"}`}
                      onClick={() => setActiveTab("markdown")}
                    >
                      Markdown
                    </button>
                    <button
                      className={`output-tab ${activeTab === "html" ? "output-tab--active" : "output-tab--inactive"}`}
                      onClick={() => setActiveTab("html")}
                    >
                      HTML
                    </button>
                  </div>
                  <div className="output-modal-actions">
                    <button
                      className="copy-button"
                      onClick={() => {
                        navigator.clipboard.writeText(outputContent);
                      }}
                    >
                      {copyLabel}
                    </button>
                    <button
                      className="output-modal-close"
                      onClick={() => setOutputModalOpen(false)}
                    >
                      ×
                    </button>
                  </div>
                </div>
                <pre className="output-pre">{outputContent}</pre>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <DocumentProvider>
        <div className="app-container">
          <EditorContent />
        </div>
      </DocumentProvider>
    </AuthProvider>
  );
}

export default App;
