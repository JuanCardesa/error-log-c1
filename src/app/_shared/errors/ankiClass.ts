import type { AnkiState } from '../labels';
import ui from '../ui.module.css';

/** Color del estado Anki de un error. Siempre acompaña a su texto. */
export function ankiClass(state: AnkiState): string {
  switch (state) {
    case 'PENDING': return ui.ankiPending ?? '';
    case 'CONVERTED': return ui.ankiConverted ?? '';
    case 'LEGACY': return ui.ankiNone ?? '';
    case 'NOT_APPLICABLE': return ui.ankiNone ?? '';
  }
}
