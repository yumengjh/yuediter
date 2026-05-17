import { useEffect, useRef, useState, useCallback } from "react";

interface UseAutoSaveOptions {
  delay?: number;
  enabled?: boolean;
}

interface UseAutoSaveResult {
  isSaving: boolean;
  lastSavedAt: Date | null;
  error: Error | null;
  saveNow: () => void;
}

export function useAutoSave<T>(
  content: T,
  saveFn: (content: T) => Promise<void>,
  options: UseAutoSaveOptions = {},
): UseAutoSaveResult {
  const { delay = 2000, enabled = true } = options;
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestContentRef = useRef(content);
  const saveFnRef = useRef(saveFn);
  const savingRef = useRef(false);

  useEffect(() => {
    latestContentRef.current = content;
  }, [content]);

  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  const doSave = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setError(null);
    try {
      await saveFnRef.current(latestContentRef.current);
      setLastSavedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e : new Error("保存失败"));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, []);

  // content 变化时防抖保存
  useEffect(() => {
    if (!enabled) return;
    if (typeof content === "string" && !content) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      doSave();
    }, delay);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [content, delay, doSave, enabled]);

  // 手动立即保存
  const saveNow = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    doSave();
  }, [doSave]);

  return { isSaving, lastSavedAt, error, saveNow };
}
