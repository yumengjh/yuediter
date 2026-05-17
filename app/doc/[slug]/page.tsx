import { notFound } from "next/navigation";
import type { Metadata } from "next";
import DOMPurify from "isomorphic-dompurify";
import { decodeDocSlug } from "@/lib/doc-slug";
import { highlightCodeBlocks } from "@/lib/highlight";
import { renderBlockTreeToHtml } from "@/services/generate-block-html";
import "@/components/markdown-editor/styles/editor.css";
import "./style.css";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "https://api-zzz.yumgjs.com/api/v1";

interface Block {
  blockId: string;
  type: string;
  payload: Record<string, unknown>;
  sortKey?: string;
  children?: Block[];
}

interface ContentResponse {
  docId: string;
  title: string;
  tree: Block;
}

async function getDocContent(slug: string) {
  let docId: string;
  try {
    docId = decodeDocSlug(slug);
  } catch {
    return null;
  }

  const res = await fetch(`${API_BASE}/documents/${docId}/content`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (!json.success) return null;

  const data: ContentResponse = json.data;
  const rawHtml = renderBlockTreeToHtml(data.tree);
  const highlighted = await highlightCodeBlocks(rawHtml);
  const html = DOMPurify.sanitize(highlighted, {
    ADD_TAGS: ["code", "pre", "span"],
    ADD_ATTR: ["class", "data-language", "data-block-id", "style"],
  });
  return { title: data.title, html };
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const doc = await getDocContent(slug);
  return { title: doc?.title || "文档不存在" };
}

export default async function DocPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = await getDocContent(slug);

  if (!doc) {
    notFound();
  }

  return (
    <div className="doc-page">
      <div className="tiptap-shell">
        <div className="tiptap-card">
          <div className="tiptap-editor-wrapper">
            <h1 className="doc-title">{doc.title || "无标题"}</h1>
            <div
              className="doc-content tiptap-editor"
              dangerouslySetInnerHTML={{ __html: doc.html }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
