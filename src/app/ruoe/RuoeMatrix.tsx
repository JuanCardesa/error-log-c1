'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

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

interface Pick {
  readonly part: number;
  readonly week: number;
}

/** La celda con que se abre: la última semana con práctica y, en ella, la part más floja. */
function defaultPick(rows: readonly MatrixRow[], weeks: number): Pick | null {
  for (let week = weeks - 1; week >= 0; week--) {
    let pick: Pick | null = null;
    let lowest = Infinity;
    for (const row of rows) {
      const cell = row.cells[week] ?? null;
      if (cell !== null && cell.pct < lowest) {
        lowest = cell.pct;
        pick = { part: row.part, week };
      }
    }
    if (pick !== null) return pick;
  }
  return null;
}

/**
 * Matriz part × semana. Solo las celdas con datos son botones; «—» es no haber practicado
 * esa semana, que no es un 0 %. Seleccionar una celda enseña las sesiones que la
 * componen, con el mismo detalle por teclado que con el ratón. El panel nunca está vacío:
 * se abre con la celda más reciente que pide atención y dice por qué es esa.
 */
export function RuoeMatrix({ weeks, rows, unpractised }: {
  readonly weeks: readonly MatrixWeek[];
  readonly rows: readonly MatrixRow[];
  /** `Part 5 y Part 7`: las parts sin práctica en el periodo, ya escritas. */
  readonly unpractised: string | null;
}) {
  const t = useT();
  const [initial] = useState(() => defaultPick(rows, weeks.length));
  const [selected, setSelected] = useState<Pick | null>(initial);
  const cell = selected === null ? null : rows.find((row) => row.part === selected.part)?.cells[selected.week] ?? null;
  const week = selected === null ? null : weeks[selected.week];
  const isInitial = selected !== null && initial !== null && selected.part === initial.part && selected.week === initial.week;
  const scroller = useRef<HTMLDivElement>(null);

  // Si la matriz no cabe, se abre por el final: las semanas recientes y la celda elegida.
  useEffect(() => {
    const element = scroller.current;
    if (element !== null) element.scrollLeft = element.scrollWidth;
  }, []);

  return (
    <div className={styles.layout}>
      <section className={styles.matrixBlock} aria-labelledby="matrix-heading">
        <h2 id="matrix-heading" className={styles.blockTitle}>{t.ruoe.title}</h2>
        <div ref={scroller} className={styles.scroll}>
          <table className={styles.matrix} style={{ minWidth: `${String(64 + weeks.length * 76)}px` }}>
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
                          onClick={() => { setSelected({ part: row.part, week: index }); }}
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
        {unpractised !== null && <p className={styles.unpractised}>{t.ruoe.partsWithoutPractice(unpractised)}</p>}
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
        {cell !== null && week !== undefined && week !== null && selected !== null && (
          <div className={styles.asideBody}>
            {isInitial && <span className={styles.asidePick}>{t.ruoe.defaultPick}</span>}
            <span className={styles.asideKicker}>{week.range}{week.partial ? t.ruoe.partialWeek : ''}</span>
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
