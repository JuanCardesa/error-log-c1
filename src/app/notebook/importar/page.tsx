import { getDb } from '@/lib/db/client';
import { listNotebookFolders } from '@/lib/db/notebookRepo';
import { NotebookImport } from '../NotebookImport';

export const dynamic = 'force-dynamic';

export default async function ImportNotebookNotePage({ searchParams }: {
  readonly searchParams: Promise<{ readonly carpeta?: string | string[] }>;
}) {
  const { carpeta } = await searchParams;
  const folders = listNotebookFolders(getDb());
  const folderId = typeof carpeta === 'string' && /^[1-9]\d*$/u.test(carpeta) ? Number(carpeta) : null;
  const initialFolderId = folders.some((folder) => folder.id === folderId) ? folderId : null;
  return <NotebookImport folders={folders} initialFolderId={initialFolderId} />;
}
