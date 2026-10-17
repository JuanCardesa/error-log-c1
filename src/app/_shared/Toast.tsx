'use client';

import { Check, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';

import { useT } from './i18nClient';
import { useShortcutLabels } from './shortcuts';
import styles from './overlay.module.css';

/**
 * Aviso breve abajo, en cristal oscuro. Vive por encima de las vistas y de cualquier panel:
 * una fila que se desmonta al guardar (una tarjeta creada, un error quitado) no se lleva su
 * confirmación, y «Deshacer» siempre se puede pulsar.
 *
 * Dura cinco segundos, diez si se puede deshacer, y se detiene mientras el ratón o el foco
 * están en él. Ctrl/⌘+Z deshace fuera de un campo de texto, donde la tecla es del campo.
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
const UNDO_DURATION_MS = 10000;
/** Al soltarlo, nunca se va antes de que dé tiempo a leerlo otra vez. */
const RESUME_MIN_MS = 2000;

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea') !== null);
}

export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const t = useT();
  const keys = useShortcutLabels();
  const [toast, setToast] = useState<ToastState | null>(null);
  const counter = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadline = useRef(0);
  const remaining = useRef(0);
  const holds = useRef({ pointer: false, focus: false });

  const stop = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const clear = useCallback(() => {
    stop();
    holds.current = { pointer: false, focus: false };
    setToast(null);
  }, [stop]);

  const run = useCallback((ms: number) => {
    stop();
    deadline.current = Date.now() + ms;
    timer.current = setTimeout(() => {
      timer.current = null;
      setToast(null);
    }, ms);
  }, [stop]);

  const show = useCallback((input: ToastInput) => {
    counter.current += 1;
    holds.current = { pointer: false, focus: false };
    setToast({ ...input, id: counter.current });
    run(input.undo === undefined ? DURATION_MS : UNDO_DURATION_MS);
  }, [run]);

  const hold = useCallback((kind: 'pointer' | 'focus', on: boolean) => {
    const wasHeld = holds.current.pointer || holds.current.focus;
    holds.current = { ...holds.current, [kind]: on };
    const held = holds.current.pointer || holds.current.focus;
    if (held && !wasHeld && timer.current !== null) {
      remaining.current = Math.max(deadline.current - Date.now(), 0);
      stop();
    } else if (!held && wasHeld) {
      run(Math.max(remaining.current, RESUME_MIN_MS));
    }
  }, [run, stop]);

  const undo = useCallback(() => {
    toast?.undo?.();
    clear();
  }, [toast, clear]);

  useEffect(() => {
    if (toast?.undo === undefined) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'z') return;
      if (event.defaultPrevented || isTextField(event.target)) return;
      event.preventDefault();
      undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toast, undo]);

  useEffect(() => stop, [stop]);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.toastRegion}>
        {/*
          * La región viva existe desde el principio: un lector de pantalla solo anuncia lo
          * que cambia dentro de una región que ya conocía. Cada aviso es un nodo nuevo, así
          * que el mismo texto dos veces seguidas también se anuncia.
          */}
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {toast !== null && <span key={toast.id}>{toast.message}</span>}
        </div>
        {toast !== null && (
          <div
            key={toast.id}
            className={`${styles.toast} ${toast.tone === 'error' ? styles.toastError : ''}`}
            onPointerEnter={() => hold('pointer', true)}
            onPointerLeave={() => hold('pointer', false)}
            onFocus={() => hold('focus', true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) hold('focus', false);
            }}
          >
            {toast.tone !== 'error' && <Check size={16} className={styles.toastCheck} aria-hidden="true" />}
            {/* El texto ya lo anuncia la región viva: aquí solo se ve. */}
            <span aria-hidden="true">{toast.message}</span>
            {toast.undo !== undefined && (
              <button type="button" className={styles.toastUndo} aria-keyshortcuts="Control+Z Meta+Z" onClick={undo}>
                {t.common.undo}
                <span className={`${styles.toastKbd} keyboard-hint`} aria-hidden="true">{keys.undo}</span>
              </button>
            )}
            <button type="button" className={styles.toastClose} aria-label={t.common.closeNotice} onClick={clear}>
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

/**
 * Para una barra fija abajo (la de la tanda): mientras está montada, el aviso sube por
 * encima de ella en vez de taparla. Mide la barra cada vez que cambia de alto (en móvil se
 * parte en dos líneas) y devuelve el ref que hay que ponerle.
 */
export function useToastClearance<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    const bar = ref.current;
    if (bar === null) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty('--toast-clearance', `${String(Math.round(bar.getBoundingClientRect().height))}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--toast-clearance');
    };
  }, []);
  return ref;
}
