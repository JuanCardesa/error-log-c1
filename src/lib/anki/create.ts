import { createHash } from 'node:crypto';

import type { Db } from '../db/client';
import { ensureAnkiScope, linkAnkiNote, setAnkiContentHash } from '../db/ankiRepo';
import { getError } from '../db/repo';
import { generatesCard } from '../domain/enums';
import type { ErrorRow } from '../domain/types';
import { ankiApi, fieldTerm, searchTerm } from './api';
import { ankiConfig, type AnkiConfig } from './config';
import { AnkiError, httpTransport, withRetry, type Transport } from './connect';
import { categoryOf } from './categories';
import { ERRORLOG_ID_FIELD, errorLogIdentity } from './identity';
import { noteLabel } from './reconcile';
import { forgetAnkiStatus, withAnkiLock } from './sync';

export const ERRORLOG_MODEL = 'Error Log C1';
export { ERRORLOG_ID_FIELD } from './identity';
export const ERRORLOG_FIELDS = [ERRORLOG_ID_FIELD, 'Prompt', 'MyAnswer', 'Correct', 'Rule', 'Meta'];

/**
 * La identidad vive en un tag y en el primer campo; se busca por las dos vias.
 *
 * Solo por el tag quedaba un estado sin salida: si el tag se pierde —renombrar tags,
 * «borrar tags no usados», una edicion a mano—, no se encuentra la nota, y `addNote` la
 * rechaza por duplicada precisamente porque el primer campo es esa misma identidad. Ni
 * crear ni vincular, sin forma de salir. El campo no se puede perder sin editar la nota.
 */
export function identityQuery(identity: string): string {
  return `(${searchTerm('tag', identity)} OR ${fieldTerm(ERRORLOG_ID_FIELD, identity)})`;
}

export function escapeAnkiHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\r?\n/g, '<br>');
}

/**
 * Huella de lo que se envio a Anki, para poder decir si la tarjeta se quedo vieja.
 *
 * Editar un error no reescribe su nota: la app decia «Verificada en Anki» de una tarjeta
 * que ya no coincidia con el error. Se excluye `ErrorLogId`, que no cambia nunca, y se
 * ordenan las claves para que la huella no dependa del orden de construccion.
 */
export function contentHash(fields: Readonly<Record<string, string>>): string {
  const pairs = Object.keys(fields).filter((name) => name !== ERRORLOG_ID_FIELD).sort()
    .map((name) => [name, fields[name] ?? '']);
  return createHash('sha256').update(JSON.stringify(pairs)).digest('hex').slice(0, 32);
}

/**
 * Margen para no confundir un reloj con un viaje en el tiempo. Una nota se crea segundos
 * despues de su error; si es cinco minutos anterior, no es jitter, es otra epoca.
 */
const RESTORE_GRACE_MS = 300_000;

/**
 * Una nota que lleva la identidad de este error pero es anterior al propio error.
 *
 * Los identificadores de nota de Anki son la marca de tiempo de su creacion en ms, igual
 * que los del revlog. Si la nota existia antes que el error, no puede ser suya: es la de
 * otro error que tuvo ese id antes de restaurar una copia anterior de esta base. Los ids
 * son AUTOINCREMENT, asi que no se reutilizan dentro de una base, pero una copia antigua
 * vuelve atras el contador y el namespace viaja con ella. Vincularla apuntaria a la
 * tarjeta de otro error, y actualizarla la sobrescribiria.
 */
export function notePredatesError(noteId: number, createdAt: string): boolean {
  const created = Date.parse(createdAt);
  return Number.isFinite(created) && noteId < created - RESTORE_GRACE_MS;
}

/** Si la tarjeta de Anki ya no dice lo que dice el error. */
export function ankiContentStale(error: ErrorRow, namespace: string, deck: string): boolean {
  if (error.ankiNoteId === null || error.ankiContentHash === null) return false;
  return contentHash(noteForError(error, namespace, deck).fields) !== error.ankiContentHash;
}

export function noteForError(error: ErrorRow, namespace: string, deck: string) {
  const identity = errorLogIdentity(namespace, error.id);
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

async function assertProfile(api: ReturnType<typeof ankiApi>, profile: string): Promise<void> {
  if (await api.profile() !== profile) {
    throw new AnkiError('ANKI_CONFIG', 'El perfil cambió. Vuelve a intentarlo con el perfil original.');
  }
}

export async function createAnkiNote(db: Db, errorId: number, transport?: Transport, now = new Date(), config: AnkiConfig = ankiConfig()) {
  forgetAnkiStatus(db);
  return withAnkiLock(db, async () => {
    const error = getError(db, errorId);
    if (error === null || !generatesCard(error.cause)) throw new AnkiError('ANKI_CONFIG', 'Ese error no existe o su causa no genera tarjeta.');
    const api = ankiApi(transport ?? withRetry(httpTransport(config)));
    await api.version();
    const profile = await api.profile();
    const state = ensureAnkiScope(db, config, profile);
    const note = noteForError(error, state.namespace, config.targetDeck);
    const matches = await api.findNotes(identityQuery(note.fields.ErrorLogId));
    if (matches.length > 1) throw new AnkiError('ANKI_ERROR', 'Hay varias notas con la identidad de este error. Revísalas en Anki antes de continuar.');
    let noteId = matches[0];
    if (noteId !== undefined && notePredatesError(noteId, error.createdAt)) {
      throw new AnkiError('ANKI_CONFIG',
        `La nota que lleva la identidad de este error se creó el ${new Date(noteId).toLocaleDateString('es-ES')}, `
        + 'antes que el propio error. Suele significar que esta base se ha restaurado de una copia anterior y los '
        + 'identificadores se han reutilizado: esa tarjeta es de otro error. No se ha vinculado ni modificado nada. '
        + 'Revísala en Anki, o usa otra base con DB_FILE_OVERRIDE para esta colección.');
    }
    if (noteId === undefined) {
      if (!(await api.modelNames()).includes(ERRORLOG_MODEL)) {
        await assertProfile(api, profile);
        await api.createModel({
          modelName: ERRORLOG_MODEL, inOrderFields: ERRORLOG_FIELDS, isCloze: false,
          css: '.card { font: 20px system-ui; text-align: left; max-width: 48em; margin: 2em auto; padding: 1em; } .wrong { color: #aa3333; } .meta { font-size: 14px; opacity: .7; }',
          cardTemplates: [{ Name: 'Recuerdo y contraste', Front: '{{Prompt}}',
            Back: '{{FrontSide}}<hr id="answer">{{#MyAnswer}}<del class="wrong">{{MyAnswer}}</del> → {{/MyAnswer}}<strong>{{Correct}}</strong><p>{{Rule}}</p><p class="meta">{{Meta}}</p>' }],
        });
      }
      const fields = await api.modelFields(ERRORLOG_MODEL);
      if (fields.join('|') !== ERRORLOG_FIELDS.join('|')) throw new AnkiError('ANKI_CONFIG', 'Ya existe un tipo «Error Log C1» con otros campos. No se ha modificado.');
      await assertProfile(api, profile);
      await api.createDeck(config.targetDeck);
      await assertProfile(api, profile);
      noteId = await api.addNote(note);
    }
    const [confirmed] = await api.notesInfo([noteId]);
    if (!confirmed || confirmed.fields['ErrorLogId']?.value !== note.fields.ErrorLogId || confirmed.cards.length === 0) {
      throw new AnkiError('ANKI_RESPUESTA_RARA', 'No se ha podido verificar una tarjeta para este error. Vuelve a intentarlo.');
    }
    if (await api.profile() !== profile) throw new AnkiError('ANKI_CONFIG', 'El perfil cambió antes de verificar la nota. Vuelve a intentarlo.');
    // Recuperar una identidad no implica que sus campos coincidan con el error actual.
    // La huella describe lo leído, también tras deshacer o reintentar un timeout.
    const confirmedFields = Object.fromEntries(ERRORLOG_FIELDS.map((name) => [name, confirmed.fields[name]?.value ?? '']));
    linkAnkiNote(db, errorId, {
      noteId, model: confirmed.modelName, label: noteLabel(confirmed), tags: confirmed.tags,
      category: categoryOf(confirmed.tags), firstSeenAt: now.toISOString(), lastSeenAt: now.toISOString(),
    }, now.toISOString(), contentHash(confirmedFields));
    return noteId;
  });
}

/**
 * Reescribe los campos de la nota ya vinculada con el texto actual del error.
 *
 * Es la unica escritura en Anki ademas de crear, y solo ocurre si se pide. No toca tags
 * ni mazo: si la categoria del error cambia, la clasificacion local es la que manda y la
 * etiqueta en Anki se queda como estaba. No se borra ni se mueve nada.
 */
export async function updateAnkiNote(db: Db, errorId: number, transport?: Transport, config: AnkiConfig = ankiConfig()) {
  forgetAnkiStatus(db);
  return withAnkiLock(db, async () => {
    const error = getError(db, errorId);
    if (error === null || error.ankiNoteId === null) {
      throw new AnkiError('ANKI_CONFIG', 'Ese error no tiene una tarjeta verificada que actualizar.');
    }
    const api = ankiApi(transport ?? withRetry(httpTransport(config)));
    await api.version();
    const profile = await api.profile();
    const state = ensureAnkiScope(db, config, profile);
    const note = noteForError(error, state.namespace, config.targetDeck);
    // La nota tiene que seguir siendo la de este error: no se pisa el trabajo de otra.
    const [current] = await api.notesInfo([error.ankiNoteId]);
    if (!current || current.fields[ERRORLOG_ID_FIELD]?.value !== note.fields.ErrorLogId) {
      throw new AnkiError('ANKI_CONFIG', 'Esa nota ya no corresponde a este error. Sincroniza y vuelve a intentarlo.');
    }
    await assertProfile(api, profile);
    await api.updateNoteFields({ id: error.ankiNoteId, fields: note.fields });
    if (await api.profile() !== profile) {
      throw new AnkiError('ANKI_CONFIG', 'El perfil cambió durante la escritura. Vuelve a intentarlo con el perfil original.');
    }
    // Solo se sella tras confirmar: si no cuajo, el aviso de «texto cambiado» sigue ahi.
    const [confirmed] = await api.notesInfo([error.ankiNoteId]);
    if (!confirmed || Object.entries(note.fields).some(([name, value]) => confirmed.fields[name]?.value !== value)) {
      throw new AnkiError('ANKI_RESPUESTA_RARA', 'Anki no ha confirmado todos los campos de la actualización. Vuelve a intentarlo.');
    }
    await assertProfile(api, profile);
    setAnkiContentHash(db, errorId, contentHash(note.fields));
    return error.ankiNoteId;
  });
}
