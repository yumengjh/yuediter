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

export function useAutoSave(
  html: string,
  saveFn: (html: string) => Promise<void>,
  options: UseAutoSaveOptions = {},
): UseAutoSaveResult {
  const { delay = 2000, enabled = true } = options;
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestHtmlRef = useRef(html);
  const saveFnRef = useRef(saveFn);
  const savingRef = useRef(false);

  useEffect(() => {
    latestHtmlRef.current = html;
  }, [html]);

  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  const doSave = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setError(null);
    try {
      await saveFnRef.current(latestHtmlRef.current);
      setLastSavedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e : new Error("保存失败"));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, []);

  // html 变化时防抖保存
  useEffect(() => {
    if (!enabled || !html) return;

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
  }, [html, delay, doSave, enabled]);

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
