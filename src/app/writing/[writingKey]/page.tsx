import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getDb } from '@/lib/db/client';
import { listWritingLibrary } from '@/lib/db/writingRepo';
import { toIsoDate } from '@/lib/time/dates';
import { assessedCriteria, writingTotal } from '@/lib/writing/library';
import { paragraphsOf } from '@/lib/writing/text';
import { parseWritingKey, writingHref } from '@/lib/writing/urls';
import { decimal, mediumDate } from '../../_shared/format';
import { getT } from '../../_shared/i18nServer';
import ui from '../../_shared/ui.module.css';
import { BANDS } from '../bands';
import { editableRow, libraryItems, pieceOptions } from '../entries';
import { WritingEditor } from '../PieceForm';
import { WritingStatusText } from '../WritingStatusText';
import styles from '../writing.module.css';

export const dynamic = 'force-dynamic';

/**
 * El lector: la redacción en su hoja de papel, tal como se escribió, y la evaluación al pie.
 * El texto es texto plano: un asterisco escrito a mano no es formato.
 */
export default async function WritingReaderPage({ params, searchParams }: {
  readonly params: Promise<{ readonly writingKey: string }>;
  readonly searchParams: Promise<{ readonly editar?: string | string[] }>;
}) {
  const { writingKey } = await params;
  const id = parseWritingKey(writingKey);
  if (id === null) notFound();

  const t = await getT();
  const w = t.writing;
  const items = libraryItems(listWritingLibrary(getDb()), t);
  const item = items.find((entry) => entry.id === id);
  if (item === undefined) notFound();
  const { piece, session } = item.row;
  const original = piece.rewriteOf === null ? undefined : items.find((entry) => entry.id === piece.rewriteOf);
  const href = writingHref(piece);
  const assessed = assessedCriteria(piece);
  const total = writingTotal(piece);
  const text = piece.originalText;
  const marked = assessed > 0 || piece.corrector !== null || piece.correctedOn !== null || piece.teacherComment !== null;

  return (
    <div className={styles.readerPage}>
      <div className={styles.readerBar}>
        <Link href="/writing" className={ui.backLink}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t.writingImport.backToWriting}
        </Link>
        <WritingEditor
          editing={editableRow(piece)}
          editingSession={session}
          originals={pieceOptions(items, t)}
          transcribed={text !== null}
          today={toIsoDate(new Date())}
          initiallyOpen={(await searchParams).editar === '1'}
          closeHref={href}
        />
      </div>

      <article className={styles.sheet} aria-labelledby="writing-title">
        <header className={styles.sheetHead}>
          <div className={styles.sheetHeading}>
            <p className={styles.sheetMeta}>
              <span>{t.labels.genre[piece.genre]}</span>
              <span>
                <time dateTime={piece.date}>{mediumDate(piece.date, t)}</time>
                {piece.dateBasis !== 'WRITTEN' && ` · ${t.writingImport.approximate}`}
              </span>
              {piece.wordCount !== null && <span>{w.words(piece.wordCount)}</span>}
              <span><WritingStatusText status={piece.status} t={t} /></span>
            </p>
            <h1 id="writing-title" className={styles.sheetTitle}>{item.title}</h1>
            {original !== undefined && (
              <p className={styles.sheetMeta}>
                <span>{w.rewriteOf} <Link href={writingHref(original.row.piece)}>{original.title}</Link></span>
              </p>
            )}
          </div>
          <p className={styles.sheetTotal}>
            {total === null
              ? <><span aria-hidden="true">—</span><span className="sr-only">{w.noScore}</span></>
              : w.score(decimal(total, t))}
          </p>
        </header>

        {piece.taskPrompt !== null && (
          <section className={styles.task} aria-labelledby="writing-task">
            <h2 id="writing-task">{w.task}</h2>
            <p>{piece.taskPrompt}</p>
          </section>
        )}

        {text === null ? (
          <div className={styles.noText}>
            <p className={styles.noTextTitle}>{w.noTranscription}</p>
            <p>{w.noTextBody}</p>
          </div>
        ) : (
          <div className={styles.text}>
            {paragraphsOf(text).map((paragraph) => <p key={paragraph.number}>{text.slice(paragraph.start, paragraph.end)}</p>)}
          </div>
        )}

        <section className={styles.assessment} aria-labelledby="writing-assessment">
          <h2 id="writing-assessment">{t.writingImport.assessmentTitle}</h2>
          {!marked ? <p className={ui.help}>{t.writingImport.notAssessed}</p> : (
            <>
              {assessed > 0 && (
                <dl className={styles.scores}>
                  {BANDS.map((band) => {
                    const value = piece[band.name];
                    return (
                      <div key={band.name}>
                        <dt>{band.label}</dt>
                        <dd className="num">{value === null ? '—' : decimal(value, t)}</dd>
                      </div>
                    );
                  })}
                  <div className={styles.scoreTotal}>
                    <dt>{t.writingImport.totalLabel}</dt>
                    <dd className="num">{total === null ? t.writingImport.partial(assessed) : w.score(decimal(total, t))}</dd>
                  </div>
                </dl>
              )}
              {(piece.corrector !== null || piece.correctedOn !== null) && (
                <p className={styles.markedBy}>
                  {piece.corrector !== null && <span>{w.corrector}: {t.labels.corrector[piece.corrector]}</span>}
                  {piece.correctedOn !== null && (
                    <span>{t.writingImport.corrected}: <time dateTime={piece.correctedOn}>{mediumDate(piece.correctedOn, t)}</time></span>
                  )}
                </p>
              )}
              {piece.teacherComment !== null && (
                <figure className={styles.comment}>
                  <figcaption>{t.writingImport.teacherComment}</figcaption>
                  <blockquote>{piece.teacherComment}</blockquote>
                </figure>
              )}
            </>
          )}
          {piece.personalNotes !== null && (
            <figure className={styles.comment}>
              <figcaption>{t.writingImport.field.personalNotes}</figcaption>
              <blockquote>{piece.personalNotes}</blockquote>
            </figure>
          )}
        </section>
      </article>
    </div>
  );
}
