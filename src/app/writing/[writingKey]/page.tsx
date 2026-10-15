import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writingAnnotation } from '@/lib/db/schema';
import { listWritingLibrary } from '@/lib/db/writingRepo';
import { toIsoDate } from '@/lib/time/dates';
import { assessedCriteria, writingTotal } from '@/lib/writing/library';
import { countWords } from '@/lib/writing/text';
import { parseWritingKey, writingHref } from '@/lib/writing/urls';
import { decimal, mediumDate } from '../../_shared/format';
import { getT } from '../../_shared/i18nServer';
import ui from '../../_shared/ui.module.css';
import { BANDS } from '../bands';
import { editableRow, libraryItems, pieceOptions } from '../entries';
import { WritingEditor } from '../PieceForm';
import { WritingStatusText } from '../WritingStatusText';
import { WritingReadingView } from '../WritingReadingView';
import { WritingTranscriptionEditor } from '../WritingTranscriptionEditor';
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
  const annotations = text === null ? [] : getDb().select({
    id: writingAnnotation.id,
    kind: writingAnnotation.kind,
    focus: writingAnnotation.focus,
    source: writingAnnotation.source,
    scope: writingAnnotation.scope,
    anchor: writingAnnotation.anchor,
    paragraph: writingAnnotation.paragraph,
    quote: writingAnnotation.quote,
    comment: writingAnnotation.comment,
    suggestion: writingAnnotation.suggestion,
    reviewedAt: writingAnnotation.reviewedAt,
  }).from(writingAnnotation).where(eq(writingAnnotation.pieceId, piece.id)).all();
  const marked = assessed > 0 || piece.corrector !== null || piece.correctedOn !== null || piece.teacherComment !== null;

  return (
    <div className={styles.readerPage}>
      <div className={styles.readerBar}>
        <Link href="/writing" className={ui.backLink}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t.writingImport.backToWriting}
        </Link>
        {text !== null && (
          <Link href={`/exportar/writing-${String(piece.id)}.json`} className={`${ui.secondary} ${ui.compact}`} download>
            {w.exportJson}
          </Link>
        )}
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
            <WritingTranscriptionEditor pieceId={piece.id} initialText="" labels={{
              correct: w.reading.correctTranscription, save: w.reading.saveTranscription,
              transcription: w.reading.transcription, saving: w.reading.saving, cancel: t.common.cancel,
            }} />
          </div>
        ) : (
          <WritingReadingView pieceId={piece.id} text={text} annotations={annotations} labels={{
              wordCount: w.reading.wordCount(piece.wordCount ?? countWords(text),
                piece.wordMin === null || piece.wordMax === null ? '220–260' : `${String(piece.wordMin)}–${String(piece.wordMax)}`),
              annotated: w.reading.annotated, clean: w.reading.clean,
              annotationsOne: w.reading.annotations(1).replace('1', '{count}'),
              annotationsMany: w.reading.annotations(2).replace('2', '{count}'),
              closeAnnotations: w.reading.closeAnnotations, annotationPanel: w.reading.annotationPanel,
              filterType: w.reading.filterType, kindLabel: w.reading.kindLabel, focusLabel: w.reading.focusLabel,
              allKinds: w.reading.allKinds, pendingOnly: w.reading.pendingOnly,
              wholeText: w.reading.wholeText, needsPlacing: w.reading.needsPlacing,
              paragraphPrefix: w.reading.paragraph(1).replace('1', ''),
              noAnnotations: w.reading.noAnnotations, noAnnotationsYet: w.reading.noAnnotationsYet,
              reviewed: w.reading.reviewed, unreviewed: w.reading.unreviewed,
              previous: w.reading.previous, next: w.reading.next, jump: w.reading.jump,
              createAnnotation: w.reading.createAnnotation, editAnnotation: w.reading.editAnnotation,
              deleteAnnotation: w.reading.deleteAnnotation, placeHere: w.reading.placeHere,
              correctTranscription: w.reading.correctTranscription,
              saveTranscription: w.reading.saveTranscription, transcription: w.reading.transcription,
              cancel: t.common.cancel,
              chooseCandidate: w.reading.chooseCandidate, saving: w.reading.saving,
              comment: w.reading.comment, suggestion: w.reading.suggestion,
              savingSource: w.reading.savingSource, missingAnnotation: w.reading.missingAnnotation,
              missingText: w.reading.missingText, invalidTarget: w.reading.invalidTarget, staleAnchor: w.reading.staleAnchor,
              restoreConflict: w.reading.restoreConflict, invalidInput: w.reading.invalidInput,
              annotationSaved: w.reading.annotationSaved, annotationPlaced: w.reading.annotationPlaced,
              annotationStudied: w.reading.annotationStudied, annotationDeleted: w.reading.annotationDeleted,
              annotationRestored: w.reading.annotationRestored, noMatches: w.reading.noMatches,
              aiSuggestion: w.reading.aiSuggestion, markStudied: w.reading.markStudied,
              saveAnnotation: w.reading.saveAnnotation,
              kind: w.reading.kind, source: w.reading.source, focus: w.reading.focus,
            }} />
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
