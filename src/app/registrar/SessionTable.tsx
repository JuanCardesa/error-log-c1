'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import type { SessionStatus } from '@/lib/domain/enums';
import { useT } from '../_shared/i18nClient';
import { StatusText } from '../_shared/StatusText';
import { isPlainKey } from '../_shared/shortcuts';
import ui from '../_shared/ui.module.css';
import styles from './sessions.module.css';

export interface SessionTableRow {
  readonly id: number;
  readonly href: string;
  readonly date: string;
  readonly title: string;
  readonly source: string;
  readonly practice: string;
  readonly score: string;
  readonly errors: number;
  readonly status: SessionStatus;
}

/**
 * Historial de sesiones. La referencia es el enlace (se puede abrir en otra pestaña) y la
 * fila entera es clicable. J y K mueven la selección e Intro la abre.
 */
export function SessionTable({ rows }: { readonly rows: readonly SessionTableRow[] }) {
  const t = useT();
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(null);
  const table = useRef<HTMLTableElement>(null);

  const rowsRef = useRef(rows);
  const selectedRef = useRef(selected);
  useEffect(() => {
    rowsRef.current = rows;
    selectedRef.current = selected;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isPlainKey(event)) return;
      const list = rowsRef.current;
      if (list.length === 0) return;
      const current = selectedRef.current;
      if (event.key === 'j' || event.key === 'k') {
        event.preventDefault();
        const next = current === null ? 0 : Math.max(0, Math.min(list.length - 1, current + (event.key === 'j' ? 1 : -1)));
        setSelected(next);
        table.current?.querySelectorAll('tbody tr')[next]?.scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'Enter' && current !== null) {
        const row = list[current];
        if (row === undefined) return;
        event.preventDefault();
        router.push(row.href);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [router]);

  return (
    <div className={ui.scrollX}>
      <table ref={table} className={`${ui.dataTable} ${ui.dataTableFixed}`}>
        <caption className="sr-only">{t.nav.sessions}</caption>
        <thead>
          <tr>
            <th scope="col" className={`${ui.colDate} ${styles.colDate}`}>{t.sessionForm.date}</th>
            <th scope="col">{t.sessionForm.reference}</th>
            <th scope="col" className={styles.colPractice}>{t.sessionForm.practice}</th>
            <th scope="col" className={`${ui.colNum} ${styles.colScore}`}>{t.sessionForm.correct}</th>
            <th scope="col" className={`${ui.colNum} ${styles.colErrors}`}>{t.nav.errors}</th>
            <th scope="col" className={`${ui.colStatus} ${styles.colStatus}`}>{t.sessionView.status}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id}
              data-clickable
              data-selected={index === selected || undefined}
              onClick={(event) => {
                if (event.target instanceof HTMLElement && event.target.closest('a') !== null) return;
                router.push(row.href);
              }}
            >
              <td className={`${ui.colDate} ${styles.colDate} ${styles.muted}`}>{row.date}</td>
              <td>
                <span className={styles.refCell}>
                  <Link href={row.href} className={styles.ref} aria-current={index === selected || undefined}>
                    {row.title}
                  </Link>
                  <span className={styles.sub}>
                    {row.source}
                    <span className={styles.mobileMeta}> · {row.practice} · {row.score}</span>
                  </span>
                </span>
              </td>
              <td className={styles.colPractice}>{row.practice}</td>
              <td className={`${ui.colNum} ${styles.colScore}`}>{row.score}</td>
              <td className={`${ui.colNum} ${styles.colErrors}`}>{row.errors}</td>
              <td className={`${ui.colStatus} ${styles.colStatus}`}><StatusText status={row.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
