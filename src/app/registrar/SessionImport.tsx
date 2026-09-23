'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseImportedBatch, type ImportedBatch } from '@/lib/import/errors';
import type { SessionRow } from '@/lib/domain/types';
import { ImportReview } from './BulkImport';
import styles from './bulk.module.css';
import ui from '../_shared/ui.module.css';

export function SessionImport({ today, openSessions, subcategorySuggestions }: {
  readonly today: string; readonly openSessions: readonly SessionRow[]; readonly subcategorySuggestions: readonly string[];
}) {
  const [text, setText] = useState('');
  const [batch, setBatch] = useState<ImportedBatch | null>(null);
  const [problem, setProblem] = useState('');
  const router = useRouter();
  // Mientras se revisa, la pagina esconde lo demas (ver .idleOnly en page.module.css).
  return <section className={ui.panel} aria-label="Importar una tanda de estudio" data-reviewing={batch?.session ? 'true' : undefined}>
    <h2>Pegar sesión y errores</h2>
    <p>Pega el bloque de «Copiar todo» de Macmillan. Revisa la cabecera y completa cada error antes de guardar.</p>
    {batch?.session ? <ImportReview session={null} proposal={batch.session} today={today}
      openSessions={openSessions} subcategorySuggestions={subcategorySuggestions} drafts={batch.errors}
      onBack={() => setBatch(null)} onSaved={(message, id) => {
        if (id !== undefined) router.push(`/registrar?s=${String(id)}&aviso=${encodeURIComponent(message)}`);
      }} /> : <>
      <label className={styles.paste}>Sesión y errores para importar
        <textarea rows={7} value={text} onChange={(event) => { setText(event.target.value); setProblem(''); }}
          placeholder={'{"session": {…}, "errors": […]}'} />
      </label>
      <button className={ui.primary} type="button" onClick={() => {
        try {
          const parsed = parseImportedBatch(text, today);
          if (parsed.session === null) throw new Error('Este bloque solo trae errores. Abre una sesión y usa «Pegar varios errores», o pega el bloque completo con session y errors.');
          setBatch(parsed); setProblem('');
        } catch (error) { setProblem(error instanceof Error ? error.message : 'No se pudo leer el bloque.'); }
      }}>Revisar sesión y errores</button>
    </>}
    {problem !== '' && <p role="alert" className={ui.fieldError}>{problem}</p>}
  </section>;
}
