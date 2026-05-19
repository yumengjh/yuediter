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
  getDocument,
  updateDocument as apiUpdateDoc,
  deleteDocument as apiDeleteDoc,
  publishDocument as apiPublishDoc,
  type Document,
  type EditorContent,
} from "../services/document";

const WORKSPACE_KEY = "currentWorkspaceId";

interface DocumentContextValue {
  workspaceId: string | null;
  currentDoc: Document | null;
  documents: Document[];
  saveStatus: "idle" | "dirty" | "flushing" | "saved" | "error";
  lastSavedAt: Date | null;
  currentDocVersion: number | null;
  setWorkspace: (id: string) => void;
  clearWorkspace: () => void;
  selectDoc: (docId: string) => Promise<void>;
  loadContent: (docId: string) => Promise<{ content: EditorContent; docVer: number }>;
  markSavedAt: (at: Date) => void;
  setSaveStatus: (status: "idle" | "dirty" | "flushing" | "saved" | "error") => void;
  createDoc: (data: { title: string; icon?: string; cover?: string; visibility?: string; category?: string }) => Promise<Document>;
  updateDoc: (docId: string, data: { title?: string; icon?: string; cover?: string; visibility?: string; tags?: string[]; category?: string; status?: string }) => Promise<void>;
  deleteDoc: (docId: string) => Promise<void>;
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
    "idle" | "dirty" | "flushing" | "saved" | "error"
  >("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [currentDocVersion, setCurrentDocVersion] = useState<number | null>(null);

  // 用 ref 保持 currentDoc 最新，避免 saveDoc 依赖 currentDoc 导致引用变化
  const currentDocRef = useRef<Document | null>(null);
  // 缓存 blockId 列表
  const blockIdsRef = useRef<string[]>([]);

  const setWorkspace = useCallback((id: string) => {
    setWorkspaceId(id);
    localStorage.setItem(WORKSPACE_KEY, id);
    setCurrentDoc(null);
    setCurrentDocVersion(null);
    currentDocRef.current = null;
    setDocuments([]);
  }, []);

  const clearWorkspace = useCallback(() => {
    setWorkspaceId(null);
    localStorage.removeItem(WORKSPACE_KEY);
    setCurrentDoc(null);
    setCurrentDocVersion(null);
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
    setCurrentDocVersion(null);
    currentDocRef.current = doc;
  }, []);

  // loadContent：加载指定文档内容（自动检测格式）
  const loadContent = useCallback(async (docId: string): Promise<{ content: EditorContent; docVer: number }> => {
    const { content, blockIds, docVer } = await loadDocumentContentV2(docId);
    blockIdsRef.current = blockIds;
    setCurrentDocVersion(docVer);
    return { content, docVer };
  }, []);

  const createDoc = useCallback(
    async (data: { title: string; icon?: string; cover?: string; visibility?: string; category?: string }): Promise<Document> => {
      if (!workspaceId) throw new Error("未选择工作空间");
      const doc = await apiCreateDoc({ workspaceId, ...data });
      setCurrentDoc(doc);
      setCurrentDocVersion(doc.head);
      currentDocRef.current = doc;
      setDocuments((prev) => [doc, ...prev]);
      return doc;
    },
    [workspaceId],
  );

  const updateDoc = useCallback(
    async (docId: string, data: { title?: string; icon?: string; cover?: string; visibility?: string; tags?: string[]; category?: string; status?: string }) => {
      const updated = await apiUpdateDoc(docId, data);
      setCurrentDoc(updated);
      setCurrentDocVersion(updated.head);
      currentDocRef.current = updated;
      setDocuments((prev) =>
        prev.map((d) => (d.docId === docId ? updated : d)),
      );
    },
    [],
  );

  const deleteDoc = useCallback(
    async (docId: string) => {
      await apiDeleteDoc(docId);
      if (currentDocRef.current?.docId === docId) {
        setCurrentDoc(null);
        setCurrentDocVersion(null);
        currentDocRef.current = null;
      }
      setDocuments((prev) => prev.filter((d) => d.docId !== docId));
    },
    [],
  );

  const publishDoc = useCallback(
    async (docId: string) => {
      const updated = await apiPublishDoc(docId);
      setCurrentDoc(updated);
      setCurrentDocVersion(updated.head);
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
        currentDocVersion,
        setWorkspace,
        clearWorkspace,
        selectDoc,
        loadContent,
        markSavedAt: setLastSavedAt,
        setSaveStatus,
        createDoc,
        updateDoc,
        deleteDoc,
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
