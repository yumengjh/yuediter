import {
  getShikiHighlighter,
  resolveCodeLanguageForShiki,
  SHIKI_LIGHT_THEME,
} from "@/components/markdown-editor/code/codeHighlight";

const codeBlockRegex = /<pre><code(?: class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g;

export async function highlightCodeBlocks(html: string): Promise<string> {
  const highlighter = await getShikiHighlighter();
  const theme = SHIKI_LIGHT_THEME;

  // Use a map to store replacements to avoid nested replacement issues
  const replacements = new Map<string, string>();
  let match;

  // Reset regex index
  codeBlockRegex.lastIndex = 0;

  while ((match = codeBlockRegex.exec(html)) !== null) {
    const fullMatch = match[0];
    const langAttr = match[1];
    const rawCode = match[2];

    // Decode HTML entities if any (Tiptap encodes them in getHTML)
    const code = rawCode
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    const lang = resolveCodeLanguageForShiki(highlighter, langAttr);

    try {
      const tokens = highlighter.codeToTokens(code, {
        lang,
        theme,
      }).tokens;

      let highlightedHtml = `<pre class="code-block-view tiptap-codeblock-node" data-language="${langAttr}"><div class="code-block-line-numbers">`;

      // Build line numbers
      for (let i = 1; i <= tokens.length; i++) {
        highlightedHtml += `<span class="code-block-line-number">${i}</span>`;
      }
      highlightedHtml += `</div><div class="code-block-content"><code>`;

      // Build tokens
      for (const line of tokens) {
        for (const token of line) {
          const style = Object.entries(token.htmlStyle || {})
            .map(([k, v]) => `${k}: ${v}`)
            .concat(token.color ? [`color: ${token.color}`] : [])
            .join("; ");

          // Escape token content for HTML
          const escapedContent = token.content
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

          if (style) {
            highlightedHtml += `<span class="tiptap-shiki-token" style="${style}">${escapedContent}</span>`;
          } else {
            highlightedHtml += escapedContent;
          }
        }
        highlightedHtml += "\n";
      }

      highlightedHtml += `</code></div></pre>`;
      replacements.set(fullMatch, highlightedHtml);
    } catch (e) {
      console.error("Highlighting error:", e);
      // Fallback to original if highlighting fails
    }
  }

  let result = html;
  for (const [original, replaced] of replacements) {
    result = result.replace(original, replaced);
  }

  return result;
}
