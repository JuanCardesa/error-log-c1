'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { useT } from '../_shared/i18nClient';
import styles from './ruoe.module.css';

export interface MatrixCell {
  readonly pct: number;
  readonly label: string;
  readonly correct: number;
  readonly total: number;
  readonly sessions: readonly { readonly id: number; readonly title: string; readonly date: string }[];
}

export interface MatrixWeek {
  readonly iso: string;
  readonly range: string;
  readonly partial: boolean;
}

export interface MatrixRow {
  readonly part: number;
  readonly cells: readonly (MatrixCell | null)[];
}

/** Tramos de fondo: acompañan al número, nunca lo sustituyen. */
function tier(pct: number): string {
  if (pct >= 85) return styles.acc85 ?? '';
  if (pct >= 70) return styles.acc70 ?? '';
  if (pct >= 55) return styles.acc55 ?? '';
  return styles.accLow ?? '';
}

/**
 * Matriz part × semana. Solo las celdas con datos son botones; «—» es no haber practicado
 * esa semana, que no es un 0 %. Seleccionar una celda enseña las sesiones que la
 * componen, con el mismo detalle por teclado que con el ratón.
 */
export function RuoeMatrix({ weeks, rows }: { readonly weeks: readonly MatrixWeek[]; readonly rows: readonly MatrixRow[] }) {
  const t = useT();
  const [selected, setSelected] = useState<{ part: number; week: number } | null>(null);
  const cell = selected === null ? null : rows.find((row) => row.part === selected.part)?.cells[selected.week] ?? null;
  const week = selected === null ? null : weeks[selected.week];

  return (
    <div className={styles.layout}>
      <section className={styles.matrixBlock} aria-labelledby="matrix-heading">
        <h2 id="matrix-heading" className={styles.blockTitle}>{t.ruoe.title}</h2>
        <div className={styles.scroll}>
          <table className={styles.matrix} style={{ minWidth: `${String(64 + weeks.length * 92)}px` }}>
            <caption className="sr-only">{t.ruoe.caption}</caption>
            <thead>
              <tr>
                <th scope="col" className={styles.partHead}>{t.sessionForm.part}</th>
                {weeks.map((item) => (
                  <th key={item.iso} scope="col" className={styles.weekHead}>
                    {item.range}{item.partial ? '*' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.part}>
                  <th scope="row" className={styles.partHead}>P{row.part}</th>
                  {row.cells.map((value, index) => {
                    const key = weeks[index]?.iso ?? String(index);
                    if (value === null) {
                      return (
                        <td key={key} className={styles.blankCell}>
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">{t.ruoe.noPractice}</span>
                        </td>
                      );
                    }
                    const isSelected = selected?.part === row.part && selected.week === index;
                    return (
                      <td key={key}>
                        <button
                          type="button"
                          className={`${styles.cell} ${tier(value.pct)} ${isSelected ? styles.cellSelected : ''}`}
                          aria-pressed={isSelected}
                          aria-label={t.ruoe.cellLabel(row.part, weeks[index]?.range ?? '', value.label, value.correct, value.total)}
                          onClick={() => { setSelected(isSelected ? null : { part: row.part, week: index }); }}
                        >
                          <span className={styles.pct}>{value.label}</span>
                          <span className={styles.ratio}>{value.correct}/{value.total}</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.note}>
          {t.ruoe.note}
        </p>
        <p className={styles.legend}>
          <span><span className={`${styles.swatch} ${styles.acc85}`} aria-hidden="true" />{t.ruoe.legend85}</span>
          <span><span className={`${styles.swatch} ${styles.acc70}`} aria-hidden="true" />{t.ruoe.legend70}</span>
          <span><span className={`${styles.swatch} ${styles.acc55}`} aria-hidden="true" />{t.ruoe.legend55}</span>
          <span><span className={`${styles.swatch} ${styles.accLow}`} aria-hidden="true" />{t.ruoe.legendLow}</span>
        </p>
      </section>

      <aside className={styles.aside} aria-label={t.ruoe.cellDetail} aria-live="polite">
        {cell === null || week === undefined || week === null || selected === null ? (
          <p className={styles.asideEmpty}>{t.ruoe.selectCell}</p>
        ) : (
          <div className={styles.asideBody}>
            <span className={styles.asideKicker}>{week.range}{week.partial ? t.ruoe.partialWeek : ''} · ISO {week.iso}</span>
            <h3 className={styles.asideTitle}>{t.format.part(selected.part)} · {cell.label}</h3>
            <span className="num">
              {t.ruoe.cellSummary(cell.correct, cell.total, cell.sessions.length)}
            </span>
            <ul className={styles.asideList}>
              {cell.sessions.map((session) => (
                <li key={session.id}>
                  <Link href={`/registrar?s=${String(session.id)}`} className={styles.asideLink}>
                    <span>{session.title}<span className={styles.asideDate}> · {session.date}</span></span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
