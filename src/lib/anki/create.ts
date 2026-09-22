import type { Db } from '../db/client';
import { ensureAnkiScope, linkAnkiNote } from '../db/ankiRepo';
import { getError } from '../db/repo';
import { generatesCard } from '../domain/enums';
import type { ErrorRow } from '../domain/types';
import { ankiApi, searchTerm } from './api';
import { ankiConfig, type AnkiConfig } from './config';
import { AnkiError, httpTransport, withRetry, type Transport } from './connect';
import { categoryOf } from './categories';
import { noteLabel } from './reconcile';
import { withAnkiLock } from './sync';

export const ERRORLOG_MODEL = 'Error Log C1';
export const ERRORLOG_FIELDS = ['ErrorLogId', 'Prompt', 'MyAnswer', 'Correct', 'Rule', 'Meta'];

export function escapeAnkiHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\r?\n/g, '<br>');
}

export function noteForError(error: ErrorRow, namespace: string, deck: string) {
  const identity = `errorlog::${namespace}::${String(error.id)}`;
  return {
    deckName: deck, modelName: ERRORLOG_MODEL,
    fields: {
      ErrorLogId: identity, Prompt: escapeAnkiHtml(error.prompt),
      MyAnswer: escapeAnkiHtml(error.myAnswer ?? ''), Correct: escapeAnkiHtml(error.correctAnswer),
      Rule: escapeAnkiHtml(error.ruleNote), Meta: escapeAnkiHtml(`${error.category} · ${error.cause}`),
    },
    options: { allowDuplicate: false },
    tags: ['errorlog', identity, `cat::${error.category.toLowerCase()}`, `errorlog::category::${error.category}`, `cause::${error.cause.toLowerCase()}`],
  };
}

export async function createAnkiNote(db: Db, errorId: number, transport?: Transport, now = new Date(), config: AnkiConfig = ankiConfig()) {
  return withAnkiLock(db, async () => {
    const error = getError(db, errorId);
    if (error === null || !generatesCard(error.cause)) throw new AnkiError('ANKI_CONFIG', 'Ese error no existe o su causa no genera tarjeta.');
    const api = ankiApi(transport ?? withRetry(httpTransport(config)));
    await api.version();
    const profile = await api.profile();
    const state = ensureAnkiScope(db, config, profile);
    const note = noteForError(error, state.namespace, config.targetDeck);
    const matches = await api.findNotes(searchTerm('tag', note.fields.ErrorLogId));
    if (matches.length > 1) throw new AnkiError('ANKI_ERROR', 'Hay varias notas con la identidad de este error. Revísalas en Anki antes de continuar.');
    let noteId = matches[0];
    if (noteId === undefined) {
      if (!(await api.modelNames()).includes(ERRORLOG_MODEL)) {
        await api.createModel({
          modelName: ERRORLOG_MODEL, inOrderFields: ERRORLOG_FIELDS, isCloze: false,
          css: '.card { font: 20px system-ui; text-align: left; max-width: 48em; margin: 2em auto; padding: 1em; } .wrong { color: #aa3333; } .meta { font-size: 14px; opacity: .7; }',
          cardTemplates: [{ Name: 'Recuerdo y contraste', Front: '{{Prompt}}',
            Back: '{{FrontSide}}<hr id="answer">{{#MyAnswer}}<del class="wrong">{{MyAnswer}}</del> → {{/MyAnswer}}<strong>{{Correct}}</strong><p>{{Rule}}</p><p class="meta">{{Meta}}</p>' }],
        });
      }
      const fields = await api.modelFields(ERRORLOG_MODEL);
      if (fields.join('|') !== ERRORLOG_FIELDS.join('|')) throw new AnkiError('ANKI_CONFIG', 'Ya existe un tipo «Error Log C1» con otros campos. No se ha modificado.');
      await api.createDeck(config.targetDeck);
      if (await api.profile() !== profile) throw new AnkiError('ANKI_CONFIG', 'El perfil cambió. Vuelve a intentarlo con el perfil original.');
      noteId = await api.addNote(note);
    }
    const [confirmed] = await api.notesInfo([noteId]);
    if (!confirmed || confirmed.fields['ErrorLogId']?.value !== note.fields.ErrorLogId || confirmed.cards.length === 0) {
      throw new AnkiError('ANKI_RESPUESTA_RARA', 'No se ha podido verificar una tarjeta para este error. Vuelve a intentarlo.');
    }
    if (await api.profile() !== profile) throw new AnkiError('ANKI_CONFIG', 'El perfil cambió antes de verificar la nota. Vuelve a intentarlo.');
    linkAnkiNote(db, errorId, {
      noteId, model: confirmed.modelName, label: noteLabel(confirmed), tags: confirmed.tags,
      category: categoryOf(confirmed.tags), firstSeenAt: now.toISOString(), lastSeenAt: now.toISOString(),
    }, now.toISOString());
    return noteId;
  });
}
