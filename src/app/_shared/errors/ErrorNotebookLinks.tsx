'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';

import {
  getErrorNoteLinksAction, getNoteOutlineAction, removeErrorNoteLinkAction,
  searchNotesAction, setErrorNoteLinkAction,
} from '@/app/notebook/actions';
import { normalizeNotebookSearchText } from '@/lib/notebook/searchText';
import type { NotebookHeading, NotebookLinkedNote, NotebookNoteSummary, NotebookPage } from '@/lib/notebook/types';
import { notebookNoteHref } from '@/lib/notebook/urls';
import { useT } from '../i18nClient';
import ui from '../ui.module.css';
import styles from './notebookLinks.module.css';

const EMPTY_RESULTS: NotebookPage<NotebookNoteSummary> = { items: [], hasMore: false };

/** The shared error panel mounts this with the error ID as key, so requests cannot paint another error. */
export function ErrorNotebookLinks({ errorId }: { readonly errorId: number }) {
  const t = useT();
  const [links, setLinks] = useState<readonly NotebookLinkedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [results, setResults] = useState(EMPTY_RESULTS);
  const [searching, setSearching] = useState(false);
  const [selectedNote, setSelectedNote] = useState<NotebookNoteSummary | null>(null);
  const [headings, setHeadings] = useState<readonly NotebookHeading[]>([]);
  const [headingSlug, setHeadingSlug] = useState<string | null>(null);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    getErrorNoteLinksAction({ errorId }).then((result) => {
      if (!active) return;
      if (result.ok) setLinks(result.data);
      else setMessage(result.message);
      setLoading(false);
    }).catch(() => {
      if (active) { setMessage(t.noteLinks.loadFailed); setLoading(false); }
    });
    return () => { active = false; };
  }, [errorId, t]);

  useEffect(() => {
    if (!pickerOpen || selectedNote !== null) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      searchNotesAction({ query, folderId: null, tag: null, page }).then((result) => {
        if (!active) return;
        if (result.ok) { setResults(result.data); setMessage(null); }
        else setMessage(result.message);
        setSearching(false);
      }).catch(() => {
        if (active) { setMessage(t.noteLinks.searchFailed); setSearching(false); }
      });
    }, query === '' ? 0 : 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [pickerOpen, query, page, selectedNote, t]);

  const chooseNote = async (note: NotebookNoteSummary) => {
    setSelectedNote(note);
    setHeadings([]);
    setHeadingSlug(links.find((item) => item.note.id === note.id)?.link.headingSlug ?? null);
    setMessage(null);
    setOutlineLoading(true);
    try {
      const result = await getNoteOutlineAction({ id: note.id });
      if (result.ok) setHeadings(result.data.headings);
      else setMessage(result.message);
    } catch {
      setMessage(t.noteLinks.outlineFailed);
    } finally {
      setOutlineLoading(false);
    }
  };

  const refreshLinks = async () => {
    const result = await getErrorNoteLinksAction({ errorId });
    if (result.ok) setLinks(result.data);
    else setMessage(result.message);
  };

  const save = () => {
    if (selectedNote === null) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await setErrorNoteLinkAction({ errorId, noteId: selectedNote.id, headingSlug });
        if (!result.ok) { setMessage(result.message); return; }
        await refreshLinks();
        setSelectedNote(null);
        setPickerOpen(false);
      } catch {
        setMessage(t.noteLinks.saveFailed);
      }
    });
  };

  const remove = (noteId: number) => {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await removeErrorNoteLinkAction({ errorId, noteId });
        if (!result.ok) { setMessage(result.message); return; }
        await refreshLinks();
      } catch {
        setMessage(t.noteLinks.unlinkFailed);
      }
    });
  };

  // The server repeats this check against the current Markdown at save time.
  const counts = new Map<string, number>();
  for (const heading of headings) {
    const key = normalizeNotebookSearchText(heading.text);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const available = headings.filter((heading) =>
    heading.text !== '' && counts.get(normalizeNotebookSearchText(heading.text)) === 1);
  const selectedValid = headingSlug === null || available.some((heading) => heading.slug === headingSlug);

  return (
    <section className={styles.section} aria-label={t.noteLinks.section} onKeyDown={(event) => {
      if (event.key === 'Escape' && pickerOpen) {
        event.stopPropagation();
        setSelectedNote(null);
        setPickerOpen(false);
        // El campo que tenía el foco desaparece con el selector: sin devolverlo al
        // disparador, el siguiente Escape ya no llegaría al panel para cerrarlo.
        toggleRef.current?.focus();
      }
    }}>
      <div className={styles.heading}>
        <h2>{t.noteLinks.section}</h2>
        <button ref={toggleRef} type="button" className={ui.textLink} onClick={() => {
          setSelectedNote(null); setQuery(''); setPage(1); setMessage(null); setPickerOpen(!pickerOpen);
        }}>{pickerOpen ? t.noteLinks.closePicker : t.noteLinks.linkNote}</button>
      </div>

      {loading ? <p className={styles.muted}>{t.noteLinks.loading}</p> : links.length === 0 ? (
        <p className={styles.muted}>{t.noteLinks.none}</p>
      ) : (
        <ul className={styles.links}>
          {links.map(({ link, note, headingStatus }) => (
            <li key={note.id}>
              <div className={styles.linkTitle}>
                <Link href={`${notebookNoteHref(note)}${headingStatus === 'valid' && link.headingSlug !== null ? `#${link.headingSlug}` : ''}`}>
                  {note.title}
                </Link>
                <span className={styles.linkActions}>
                  <button type="button" className={ui.textLink} disabled={pending} onClick={() => {
                    setPickerOpen(true); void chooseNote(note);
                  }}>{t.noteLinks.chooseSection}</button>
                  <button type="button" className={ui.textLink} disabled={pending} onClick={() => { remove(note.id); }}>{t.noteLinks.unlink}</button>
                </span>
              </div>
              {headingStatus === 'valid' && <p className={styles.muted}>{t.noteLinks.sectionValue(link.headingText ?? '')}</p>}
              {headingStatus === 'changed' && <p className={styles.changed}>{t.noteLinks.sectionChanged}</p>}
            </li>
          ))}
        </ul>
      )}

      {pickerOpen && (
        <div className={styles.picker}>
          {selectedNote === null ? (
            <>
              <label className={styles.searchLabel} htmlFor={`note-search-${String(errorId)}`}>{t.noteLinks.searchNotes}</label>
              <input id={`note-search-${String(errorId)}`} className={ui.input} type="search" value={query}
                placeholder={t.noteLinks.searchPlaceholder} maxLength={200}
                onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
              {searching && <p className={styles.muted} role="status">{t.noteLinks.searching}</p>}
              {!searching && results.items.length === 0 && <p className={styles.muted}>{t.noteLinks.noResults}</p>}
              <ul className={styles.results} aria-label={t.noteLinks.found}>
                {results.items.map((note) => (
                  <li key={note.id}>
                    <button type="button" onClick={() => { void chooseNote(note); }}>{note.title}</button>
                    {links.some((item) => item.note.id === note.id) && <span className={styles.muted}>{t.noteLinks.linked}</span>}
                  </li>
                ))}
              </ul>
              <div className={styles.paging}>
                <button type="button" className={ui.ghost} disabled={page === 1 || searching} onClick={() => { setPage(page - 1); }}>{t.common.previous}</button>
                <span>{t.common.page(page)}</span>
                <button type="button" className={ui.ghost} disabled={!results.hasMore || searching} onClick={() => { setPage(page + 1); }}>{t.common.next}</button>
              </div>
            </>
          ) : (
            <>
              <button type="button" className={ui.textLink} onClick={() => { setSelectedNote(null); setMessage(null); }}>{t.noteLinks.backToSearch}</button>
              <h3 className={styles.selectedTitle}>{selectedNote.title}</h3>
              {outlineLoading ? <p className={styles.muted}>{t.noteLinks.loadingSections}</p> : (
                <label className={styles.searchLabel}>{t.noteLinks.sectionLabel}
                  <select className={ui.select} value={headingSlug ?? ''} onChange={(event) => { setHeadingSlug(event.target.value || null); }}>
                    <option value="">{t.noteLinks.wholeNote}</option>
                    {!selectedValid && <option value={headingSlug ?? ''} disabled>{t.noteLinks.sectionChangedOption}</option>}
                    {available.map((heading) => <option key={heading.slug} value={heading.slug}>{heading.text}</option>)}
                  </select>
                </label>
              )}
              {headings.length > available.length && <p className={styles.muted}>{t.noteLinks.duplicateSections}</p>}
              <div className={styles.saveRow}>
                <button type="button" className={ui.secondary} disabled={pending || outlineLoading || !selectedValid}
                  onClick={save}>{pending ? t.common.saving : t.noteLinks.saveLink}</button>
              </div>
            </>
          )}
        </div>
      )}
      {message !== null && <p role="alert" className={styles.error}>{message}</p>}
    </section>
  );
}
