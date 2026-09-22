import type { q7AnkiReviews } from '@/lib/queries/q7AnkiReviews';
import shared from '../_shared/report.module.css';
import styles from './anki.module.css';

export function ReviewFailures({ result, windowDays, synced }: {
  readonly result: ReturnType<typeof q7AnkiReviews>; readonly windowDays: number; readonly synced: boolean;
}) {
  return (
    <section className={shared.panel} aria-labelledby="reviews-heading">
      <h2 id="reviews-heading">Repaso en Anki</h2>
      <p className={shared.note}>Últimos {windowDays} días civiles. «Again» cuenta como fallo; Hard, Good y Easy como acierto.
        Una carta puede generar varios repasos. No incluye reprogramaciones manuales.</p>
      <dl className={styles.summary}>
        <div><dt>Repasos</dt><dd>{result.reviews}</dd></div>
        <div><dt>Aciertos</dt><dd>{result.accuracy === null ? '—' : `${String(result.accuracy)}%`}</dd></div>
        <div><dt>Fallos</dt><dd>{result.failures}</dd></div>
        <div><dt>Cartas distintas</dt><dd>{result.distinctCards}</dd></div>
      </dl>
      {result.reviews === 0 ? <p className={shared.empty}>{synced
        ? 'Sin repasos en esta ventana. El historial antiguo no cuenta como estudio reciente.'
        : 'Sincroniza Anki para consultar tus repasos. Todavía no hay datos importados.'}</p>
        : result.failures === 0 ? <p>Sin fallos en los repasos de esta ventana.</p>
        : result.groups.filter((group) => group.failures > 0).map((group) => (
          <div key={group.category ?? 'SIN_MAPEAR'} className={styles.failures}>
            <h3>{group.category ?? 'Sin categoría asignada'} · {group.failures} fallos / {group.reviews} repasos</h3>
            <ul>{group.notes.map((note) => <li key={note.noteId}><span>{note.label}</span><strong>{note.failures} {note.failures === 1 ? 'fallo' : 'fallos'}</strong></li>)}</ul>
          </div>
        ))}
    </section>
  );
}
