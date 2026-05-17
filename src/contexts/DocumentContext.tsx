import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import {
  createDocument as apiCreateDoc,
  listDocuments as apiListDocs,
  loadDocumentContentV2,
  saveDocumentContentV2,
  getDocument,
  updateDocument as apiUpdateDoc,
  publishDocument as apiPublishDoc,
  type Document,
  type EditorContent,
} from "../services/document";
import type { TiptapDoc } from "../services/tiptap-converter";

const WORKSPACE_KEY = "currentWorkspaceId";

interface DocumentContextValue {
  workspaceId: string | null;
  currentDoc: Document | null;
  documents: Document[];
  saveStatus: "idle" | "saving" | "saved" | "error";
  lastSavedAt: Date | null;
  setWorkspace: (id: string) => void;
  clearWorkspace: () => void;
  selectDoc: (docId: string) => Promise<void>;
  loadContent: (docId: string) => Promise<EditorContent>;
  saveDoc: (content: EditorContent) => Promise<void>;
  createDoc: (title: string) => Promise<Document>;
  updateDoc: (docId: string, data: { title?: string; icon?: string; visibility?: string }) => Promise<void>;
  publishDoc: (docId: string) => Promise<void>;
  refreshDocs: () => Promise<void>;
  getBlockId: (domIndex: number) => string | undefined;
}

const DocumentContext = createContext<DocumentContextValue | null>(null);

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [workspaceId, setWorkspaceId] = useState<string | null>(
    () => localStorage.getItem(WORKSPACE_KEY),
  );
  const [currentDoc, setCurrentDoc] = useState<Document | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // 用 ref 保持 currentDoc 最新，避免 saveDoc 依赖 currentDoc 导致引用变化
  const currentDocRef = useRef<Document | null>(null);
  // 记录最近一次保存的内容，用于脏检查
  const lastSavedContentRef = useRef<EditorContent>("");
  // 缓存 blockId 列表
  const blockIdsRef = useRef<string[]>([]);

  const setWorkspace = useCallback((id: string) => {
    setWorkspaceId(id);
    localStorage.setItem(WORKSPACE_KEY, id);
    setCurrentDoc(null);
    currentDocRef.current = null;
    setDocuments([]);
  }, []);

  const clearWorkspace = useCallback(() => {
    setWorkspaceId(null);
    localStorage.removeItem(WORKSPACE_KEY);
    setCurrentDoc(null);
    currentDocRef.current = null;
    setDocuments([]);
  }, []);

  const refreshDocs = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const res = await apiListDocs({
        workspaceId,
        sortBy: "updatedAt",
        sortOrder: "DESC",
      });
      setDocuments(res.items);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("工作空间不存在")) {
        clearWorkspace();
      }
      throw e;
    }
  }, [workspaceId, clearWorkspace]);

  // selectDoc：Header 调用，只设置 currentDoc，不加载内容
  const selectDoc = useCallback(async (docId: string) => {
    const doc = await getDocument(docId);
    setCurrentDoc(doc);
    currentDocRef.current = doc;
  }, []);

  // loadContent：加载指定文档内容（自动检测格式）
  const loadContent = useCallback(async (docId: string): Promise<EditorContent> => {
    const { content, blockIds } = await loadDocumentContentV2(docId);
    blockIdsRef.current = blockIds;
    lastSavedContentRef.current = content;
    return content;
  }, []);

  // saveDoc：引用永远稳定（不依赖 currentDoc state）
  const saveDoc = useCallback(async (content: EditorContent) => {
    const doc = currentDocRef.current;
    if (!doc) return;
    // 脏检查：内容未变化则跳过
    if (typeof content === "string" && typeof lastSavedContentRef.current === "string") {
      if (content === lastSavedContentRef.current) return;
    } else if (typeof content === "object" && typeof lastSavedContentRef.current === "object") {
      if (JSON.stringify(content) === JSON.stringify(lastSavedContentRef.current)) return;
    }
    setSaveStatus("saving");
    try {
      await saveDocumentContentV2(doc.docId, content, doc.rootBlockId);
      lastSavedContentRef.current = content;
      setSaveStatus("saved");
      setLastSavedAt(new Date());
    } catch (e) {
      console.error("保存失败:", e);
      setSaveStatus("error");
      throw new Error("保存失败");
    }
  }, []);

  const createDoc = useCallback(
    async (title: string): Promise<Document> => {
      if (!workspaceId) throw new Error("未选择工作空间");
      const doc = await apiCreateDoc({ workspaceId, title });
      setCurrentDoc(doc);
      currentDocRef.current = doc;
      setDocuments((prev) => [doc, ...prev]);
      return doc;
    },
    [workspaceId],
  );

  const updateDoc = useCallback(
    async (docId: string, data: { title?: string; icon?: string; visibility?: string }) => {
      const updated = await apiUpdateDoc(docId, data);
      setCurrentDoc(updated);
      currentDocRef.current = updated;
      setDocuments((prev) =>
        prev.map((d) => (d.docId === docId ? updated : d)),
      );
    },
    [],
  );

  const publishDoc = useCallback(
    async (docId: string) => {
      const updated = await apiPublishDoc(docId);
      setCurrentDoc(updated);
      currentDocRef.current = updated;
      setDocuments((prev) =>
        prev.map((d) => (d.docId === docId ? updated : d)),
      );
    },
    [],
  );

  const getBlockId = useCallback((_domIndex: number): string | undefined => {
    return undefined;
  }, []);

  return (
    <DocumentContext.Provider
      value={{
        workspaceId,
        currentDoc,
        documents,
        saveStatus,
        lastSavedAt,
        setWorkspace,
        clearWorkspace,
        selectDoc,
        loadContent,
        saveDoc,
        createDoc,
        updateDoc,
        publishDoc,
        refreshDocs,
        getBlockId,
      }}
    >
      {children}
    </DocumentContext.Provider>
  );
}

export function useDocument(): DocumentContextValue {
  const ctx = useContext(DocumentContext);
  if (!ctx)
    throw new Error("useDocument must be used within DocumentProvider");
  return ctx;
}
