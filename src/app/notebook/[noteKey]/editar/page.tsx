import { notFound } from 'next/navigation';

import { getDb } from '@/lib/db/client';
import { getNotebookNote, listNotebookFolders } from '@/lib/db/notebookRepo';
import { parseNotebookNoteId } from '@/lib/notebook/urls';
import { NotebookEditorEntry } from '../../NotebookEditorEntry';

export const dynamic = 'force-dynamic';

export default async function EditNotebookNotePage({ params, searchParams }: {
  readonly params: Promise<{ readonly noteKey: string }>;
  readonly searchParams: Promise<{ readonly borrador?: string | string[] }>;
}) {
  const { noteKey } = await params;
  const id = parseNotebookNoteId(noteKey);
  if (id === null) notFound();
  const db = getDb();
  const note = getNotebookNote(db, id);
  if (note === null) notFound();
  const { borrador } = await searchParams;
  return <NotebookEditorEntry key={note.id} id={note.id} uid={note.uid} folders={listNotebookFolders(db)}
    requestedDraftKey={typeof borrador === 'string' ? borrador : undefined} />;
}
