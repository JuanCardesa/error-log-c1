'use client';

import { Check, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import styles from './overlay.module.css';

/**
 * Aviso breve abajo, en cristal oscuro. Vive por encima de las vistas: una fila que se
 * desmonta al guardar (una tarjeta creada, un error quitado) no se lleva su confirmación.
 * Dura cinco segundos; «Deshacer» es opcional y solo para lo que aún es local.
 */

interface ToastInput {
  readonly message: string;
  readonly undo?: () => void;
  readonly tone?: 'ok' | 'error';
}

interface ToastState extends ToastInput {
  readonly id: number;
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => undefined);

const DURATION_MS = 5000;

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const counter = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const show = useCallback((input: ToastInput) => {
    if (timer.current !== null) clearTimeout(timer.current);
    counter.current += 1;
    setToast({ ...input, id: counter.current });
    timer.current = setTimeout(() => {
      timer.current = null;
      setToast(null);
    }, DURATION_MS);
  }, []);

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* La región existe siempre: un lector anuncia lo que entra en ella. */}
      <div className={styles.toastRegion} role="status" aria-live="polite">
        {toast !== null && (
          <div key={toast.id} className={`${styles.toast} ${toast.tone === 'error' ? styles.toastError : ''}`}>
            {toast.tone !== 'error' && <Check size={16} className={styles.toastCheck} aria-hidden="true" />}
            <span>{toast.message}</span>
            {toast.undo !== undefined && (
              <button
                type="button"
                className={styles.toastUndo}
                onClick={() => {
                  toast.undo?.();
                  clear();
                }}
              >
                Deshacer
              </button>
            )}
            <button type="button" className={styles.toastClose} aria-label="Cerrar aviso" onClick={clear}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): (toast: ToastInput) => void {
  return useContext(ToastContext);
}
