import { useState, useMemo } from "react";
import TurndownService from "turndown";
import { MarkdownEditor } from "./components/markdown-editor";
import "./App.css";

const initialContent = `<h2>欢迎使用 Markdown Editor</h2>
<p>这是一个 <strong>可复用的富文本编辑器组件</strong>，基于 TipTap 构建，支持：</p>
<ul>
  <li>标题（H1-H6）</li>
  <li><strong>加粗</strong>、<em>斜体</em>、<u>下划线</u>、<s>删除线</s></li>
  <li>有序列表和无序列表</li>
  <li>代码块（带语法高亮）</li>
  <li>引用块</li>
  <li>链接和待办列表</li>
</ul>
<blockquote><p>试试在工具栏中探索各种格式化功能！</p></blockquote>
<pre><code class="language-typescript">const greeting = "Hello, World!";
console.log(greeting);
</code></pre>
<p>开始编辑吧 ↓</p>`;

// 非标准样式 → 保留为 HTML 的标签/属性
const INLINE_STYLE_TAGS = ["u", "mark", "span"];

function createTurndownService(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    strongDelimiter: "**",
  });

  // 覆盖默认 hr 规则：用 --- 而非 ***
  td.addRule("horizontalRule", {
    filter: "hr",
    replacement: () => "\n\n---\n\n",
  });

  // 保留带 style 的 <span>（字体大小、颜色、背景色）
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

  // 保留 <u> 下划线
  td.addRule("underline", {
    filter: "u",
    replacement: (content) => `<u>${content}</u>`,
  });

  // 保留 <mark> 高亮（带自定义颜色）
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

  // 保留带 text-align 的块级元素
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
      // 对于标题，先用标准 md 语法，再包 div
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

  // 保留 task list checkbox（兼容 antd Checkbox NodeView 结构）
  td.addRule("taskListItem", {
    filter: (node) => {
      return node.nodeName === "LI" && !!(node as HTMLElement).querySelector('input[type="checkbox"]');
    },
    replacement: (content, node) => {
      const checkbox = (node as HTMLElement).querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      const checked = checkbox?.checked ? "x" : " ";
      // 去掉 checkbox 及 antd 组件可能产生的多余文本
      const clean = content.replace(/^\s*\[[ x]\]\s*/, "").replace(/^\s+/, "").trim();
      return `- [${checked}] ${clean}\n`;
    },
  });

  // 表格 wrapper → 直接输出子内容（tiptap resizable table 外层容器）
  td.addRule("tableWrapper", {
    filter: (node) => {
      return node.nodeName === "DIV" && (node as HTMLElement).classList.contains("tableWrapper");
    },
    replacement: (content) => content,
  });

  // HTML 表格 → Markdown 表格语法
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

function App() {
  const [html, setHtml] = useState(initialContent);
  const [activeTab, setActiveTab] = useState<OutputTab>("markdown");

  const markdown = useMemo(() => htmlToMarkdown(html), [html]);

  const outputContent = activeTab === "html" ? html : markdown;
  const copyLabel = activeTab === "html" ? "复制 HTML" : "复制 Markdown";

  return (
    <div className="app-container">
      <div className="output-card">
        <MarkdownEditor
          content={html}
          onChange={setHtml}
          placeholder="开始记录你的知识吧…"
        />
      </div>

      <div className="output-card" style={{ marginTop: 24 }}>
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
          <div style={{ flex: 1 }} />
          <button
            className="copy-button"
            onClick={() => {
              navigator.clipboard.writeText(outputContent);
            }}
          >
            {copyLabel}
          </button>
        </div>
        <pre className="output-pre">
          {outputContent}
        </pre>
      </div>
    </div>
  );
}

export default App;
