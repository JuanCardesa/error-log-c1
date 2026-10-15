import { getDb } from '@/lib/db/client';
import { getSession, hasWritingPiece } from '@/lib/db/repo';
import { sessionTitle } from '../../_shared/format';
import { getT } from '../../_shared/i18nServer';
import { WritingImport, type LinkedSession } from './WritingImport';

export const dynamic = 'force-dynamic';

/**
 * Importar una redacción. Con `?sesion=<id>` (el regreso desde Sesiones) se enlaza esa
 * sesión Writing libre en vez de crear otra; si ya no está libre, se importa sin ella.
 */
export default async function ImportWritingPage({ searchParams }: {
  readonly searchParams: Promise<{ readonly sesion?: string | string[] }>;
}) {
  const { sesion } = await searchParams;
  const t = await getT();
  const db = getDb();
  const id = typeof sesion === 'string' && /^[1-9]\d*$/u.test(sesion) ? Number(sesion) : null;
  const session = id === null ? null : getSession(db, id);
  const linkedSession: LinkedSession | null = session !== null && session.paper === 'WRITING' && !hasWritingPiece(db, session.id)
    ? { id: session.id, title: sessionTitle(session, t), date: session.date }
    : null;
  return <WritingImport linkedSession={linkedSession} />;
}
