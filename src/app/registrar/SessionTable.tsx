'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import type { SessionStatus } from '@/lib/domain/enums';
import { StatusText } from '../_shared/StatusText';
import { isPlainKey } from '../_shared/shortcuts';
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
    <div className={styles.tableWrap}>
      <table ref={table} className={styles.table}>
        <caption className="sr-only">Sesiones</caption>
        <thead>
          <tr>
            <th scope="col" className={styles.colDate}>Fecha</th>
            <th scope="col">Referencia</th>
            <th scope="col" className={styles.colPractice}>Práctica</th>
            <th scope="col" className={`${styles.colScore} ${styles.right}`}>Aciertos</th>
            <th scope="col" className={`${styles.colErrors} ${styles.right}`}>Errores</th>
            <th scope="col" className={styles.colStatus}>Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id}
              className={index === selected ? styles.selected : undefined}
              onClick={(event) => {
                if (event.target instanceof HTMLElement && event.target.closest('a') !== null) return;
                router.push(row.href);
              }}
            >
              <td className={`${styles.colDate} ${styles.muted}`}>{row.date}</td>
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
              <td className={`${styles.colScore} ${styles.right}`}>{row.score}</td>
              <td className={`${styles.colErrors} ${styles.right}`}>{row.errors}</td>
              <td className={styles.colStatus}><StatusText status={row.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
