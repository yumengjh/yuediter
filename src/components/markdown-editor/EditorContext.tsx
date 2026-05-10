import { createContext, useContext } from "react";
import type { Editor } from "@tiptap/react";

interface EditorContextValue {
  editor: Editor | null;
}

const EditorContext = createContext<EditorContextValue>({ editor: null });

export const EditorContextProvider = EditorContext.Provider;

export const useMarkdownEditor = (): Editor | null => {
  return useContext(EditorContext).editor;
};
