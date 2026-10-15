'use client';

import {
  BookOpen,
  Calendar,
  ChartColumn,
  CircleAlert,
  ClipboardPaste,
  Download,
  List,
  type LucideIcon,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { notebookNoteHref } from '@/lib/notebook/urls';
import { useT } from './i18nClient';
import { type PaletteResults, searchPaletteAction } from './searchActions';
import { useShortcutLabels } from './shortcuts';
import styles from './palette.module.css';

/**
 * Búsqueda global y acciones. `<dialog>` modal: el foco va al campo al abrir, ↑↓ mueven,
 * Intro abre, Escape o un clic fuera cierran y el foco vuelve a quien la abrió.
 *
 * Los errores, sesiones y apuntes los busca el servidor, con un pequeño retardo al teclear y
 * descartando las respuestas que lleguen tarde.
 */

interface Item {
  readonly key: string;
  readonly group: 'errors' | 'sessions' | 'notebook' | 'actions';
  readonly icon: LucideIcon;
  readonly label: string;
  readonly mine?: string | null;
  readonly sub?: string;
  readonly kbd?: string;
  readonly href: string;
}

const EMPTY: PaletteResults = { errors: [], sessions: [], notes: [] };
const DEBOUNCE_MS = 140;

export function CommandPalette({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const keys = useShortcutLabels();
  const t = useT();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [resultState, setResultState] = useState<{ query: string; results: PaletteResults }>({ query: '', results: EMPTY });
  const results = resultState.query === query.trim() ? resultState.results : EMPTY;
  const [active, setActive] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      dialog.showModal();
      input.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    requestId.current += 1;
    const mine = requestId.current;
    if (q === '') return;
    const timer = setTimeout(() => {
      void searchPaletteAction(q).then(
        (found) => { if (requestId.current === mine) setResultState({ query: q, results: found }); },
        () => { if (requestId.current === mine) setResultState({ query: q, results: EMPTY }); },
      );
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); };
  }, [query]);

  const items = useMemo((): Item[] => {
    const q = query.trim().toLowerCase();
    const found: Item[] = q === '' ? [] : [
      ...results.errors.map((error): Item => ({
        key: `e${String(error.id)}`,
        group: 'errors',
        icon: CircleAlert,
        label: error.correct,
        mine: error.mine,
        sub: error.sub,
        href: `/errores?error=${String(error.id)}`,
      })),
      ...results.sessions.map((session): Item => ({
        key: `s${String(session.id)}`,
        group: 'sessions',
        icon: Calendar,
        label: session.title,
        sub: session.sub,
        href: `/registrar?s=${String(session.id)}`,
      })),
      ...results.notes.map((note): Item => ({
        key: `n${String(note.id)}`,
        group: 'notebook',
        icon: BookOpen,
        label: note.title,
        sub: note.sub,
        href: notebookNoteHref(note),
      })),
    ];
    const actions: Item[] = [
      { key: 'new', group: 'actions', icon: Plus, label: t.palette.newSession, kbd: 'N', href: '/registrar?nueva=1' },
      { key: 'paste', group: 'actions', icon: ClipboardPaste, label: t.palette.pasteBatch, kbd: keys.paste, href: '/registrar#pegar' },
      { key: 'gs', group: 'actions', icon: Calendar, label: t.palette.goTo(t.nav.sessions), kbd: 'G S', href: '/registrar' },
      { key: 'ge', group: 'actions', icon: List, label: t.palette.goTo(t.nav.errors), kbd: 'G E', href: '/errores' },
      { key: 'gp', group: 'actions', icon: ChartColumn, label: t.palette.goTo(t.nav.progress), kbd: 'G P', href: '/informe' },
      { key: 'ga', group: 'actions', icon: RefreshCw, label: t.palette.goTo(t.nav.anki), kbd: 'G A', href: '/anki' },
      { key: 'gn', group: 'actions', icon: BookOpen, label: t.palette.goTo(t.nav.notebook), kbd: 'G N', href: '/notebook' },
      { key: 'export', group: 'actions', icon: Download, label: t.nav.exportData, href: '/exportar' },
    ];
    return [...found, ...actions.filter((action) => q === '' || action.label.toLowerCase().includes(q))];
  }, [query, results, keys.paste, t]);

  const current = Math.min(active, Math.max(0, items.length - 1));

  const close = () => {
    requestId.current += 1;
    setQuery('');
    setResultState({ query: '', results: EMPTY });
    setActive(0);
    onClose();
  };

  const run = (item: Item | undefined) => {
    if (item === undefined) return;
    close();
    router.push(item.href);
  };

  return (
    <dialog
      ref={ref}
      className={styles.palette}
      aria-label={t.palette.label}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        // Un clic en el fondo (fuera de la caja) llega al propio dialog.
        if (event.target === ref.current) close();
      }}
    >
      {open && (
        <div className={styles.box}>
          <div className={styles.inputRow}>
            <Search size={20} aria-hidden="true" />
            <input
              ref={input}
              className={styles.input}
              value={query}
              placeholder={t.palette.placeholder}
              aria-label={t.palette.label}
              maxLength={200}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={items[current] === undefined ? undefined : `${listId}-${items[current].key}`}
              autoComplete="off"
              onChange={(event) => {
                requestId.current += 1;
                setQuery(event.target.value);
                setActive(0);
                if (event.target.value.trim() === '') setResultState({ query: '', results: EMPTY });
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setActive(Math.min(items.length - 1, current + 1));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setActive(Math.max(0, current - 1));
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  run(items[current]);
                }
              }}
            />
            <kbd>esc</kbd>
          </div>

          <div id={listId} role="listbox" aria-label={t.palette.results} className={styles.list}>
            {items.map((item, index) => {
              const Icon = item.icon;
              const head = index === 0 || items[index - 1]?.group !== item.group;
              return (
                <div key={item.key} role="presentation">
                  {head && <div className={styles.group} role="presentation">{t.palette.groups[item.group]}</div>}
                  <div
                    id={`${listId}-${item.key}`}
                    role="option"
                    aria-selected={index === current}
                    className={styles.option}
                    onMouseEnter={() => { setActive(index); }}
                    onClick={() => { run(item); }}
                  >
                    <Icon size={16} className={styles.optionIcon} aria-hidden="true" />
                    <span className={styles.optionText}>
                      <span className={styles.optionLabel}>
                        {item.mine !== undefined && item.mine !== null && item.mine !== '' && (
                          <>
                            <s className={styles.mine}>{item.mine}</s>
                            <span className={styles.arrow} aria-hidden="true">→</span>
                          </>
                        )}
                        <span className={styles.labelText}>{item.label}</span>
                      </span>
                      {item.sub !== undefined && <span className={styles.sub}>{item.sub}</span>}
                    </span>
                    {item.kbd !== undefined && <kbd>{item.kbd}</kbd>}
                  </div>
                </div>
              );
            })}
            {items.length === 0 && <p className={styles.empty}>{t.palette.noResults(query)}</p>}
          </div>

          <div className={styles.foot} aria-hidden="true">
            <span>{t.palette.navigate}</span>
            <span>{t.palette.open}</span>
            <span>{t.palette.close}</span>
            <span className={styles.footHint}>{t.palette.hint}</span>
          </div>
        </div>
      )}
    </dialog>
  );
}
