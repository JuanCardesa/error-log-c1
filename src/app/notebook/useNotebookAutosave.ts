'use client';

import { useEffect, useRef } from 'react';

/** Debounce only the server write. The local draft has its own shorter timer. */
export function useNotebookAutosave(formKey: string, enabled: boolean, save: () => void) {
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; }, [save]);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => { saveRef.current(); }, 1000);
    return () => { window.clearTimeout(timer); };
  }, [formKey, enabled]);
}
