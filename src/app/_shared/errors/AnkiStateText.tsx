'use client';

import { useT } from '../i18nClient';
import type { AnkiState } from '../labels';
import ui from '../ui.module.css';

const TONE: Record<AnkiState, string | undefined> = {
  PENDING: ui.ankiTagPending,
  CONVERTED: ui.ankiTagConverted,
  LEGACY: ui.ankiTagNone,
  NOT_APPLICABLE: ui.ankiTagNone,
};

/** Estado Anki de un error en una fila: forma y texto, sin ámbar (ver `ui.ankiTag`). */
export function AnkiStateText({ state }: { readonly state: AnkiState }) {
  const t = useT();
  return (
    <span className={`${ui.ankiTag} ${TONE[state] ?? ''}`}>
      <span className={ui.ankiTagShape} aria-hidden="true" />
      {t.labels.ankiState[state]}
    </span>
  );
}
