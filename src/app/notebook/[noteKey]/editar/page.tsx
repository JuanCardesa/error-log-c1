import { notFound } from 'next/navigation';

import { getDb } from '@/lib/db/client';
import { getNotebookNote, listNotebookFolders } from '@/lib/db/notebookRepo';
import { parseNotebookNoteId } from '@/lib/notebook/urls';
import { NotebookEditor } from '../../NotebookEditor';

export const dynamic = 'force-dynamic';

export default async function EditNotebookNotePage({ params }: {
  readonly params: Promise<{ readonly noteKey: string }>;
}) {
  const { noteKey } = await params;
  const id = parseNotebookNoteId(noteKey);
  if (id === null) notFound();
  const db = getDb();
  const note = getNotebookNote(db, id);
  if (note === null) notFound();
  return <NotebookEditor key={note.id} note={note} folders={listNotebookFolders(db)} />;
}
