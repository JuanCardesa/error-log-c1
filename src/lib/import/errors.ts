import { z } from 'zod';

import { CATEGORIES, CAUSES, CONFIDENCES, PAPERS, SESSION_KINDS, SOURCES } from '../domain/enums';
import { sessionInputSchema } from '../validation/schemas';
import { toIsoDate } from '../time/dates';

export const MAX_IMPORT_ROWS = 100;
export const MAX_IMPORT_LENGTH = 200_000;
export const MAX_SESSION_IMPORT_ROWS = 300;

const spanishError = z.locales.es().localeError;
export const importParseOptions = { error: ((issue) => issue.code === 'unrecognized_keys'
  ? `campos no permitidos (${issue.keys.join(', ')})` : spanishError(issue)) satisfies z.core.$ZodErrorMap };

// Lista cerrada de campos de la cabecera pegada. Ni id, status ni duración.
export const importedSessionSchema = z.strictObject({
  date: z.string(), kind: z.enum(SESSION_KINDS), paper: z.enum(PAPERS).nullable(),
  part: z.number().int().positive().nullable(), source: z.enum(SOURCES),
  sourceRef: z.string().nullable(), itemsTotal: z.number().int().nonnegative().nullable(),
  itemsCorrect: z.number().int().nonnegative().nullable(), timed: z.boolean(),
});
export type ImportedSession = z.infer<typeof importedSessionSchema>;

export function importEnvelopeSchema(today: string) {
  return z.strictObject({
    session: importedSessionSchema.superRefine((value, ctx) => {
      const parsed = sessionInputSchema({ today }).safeParse(value, importParseOptions);
      if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    }),
    errors: sessionImportRowsSchema,
  });
}

export function importIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || 'sobre'}: ${
    issue.code === 'unrecognized_keys' ? `campos no permitidos (${issue.keys.join(', ')})` : issue.message
  }`).join('; ');
}

/** Lo que proponemos cuando la tanda no trae causa ni confianza; se revisan en la vista previa. */
const DEFAULT_CAUSE = 'DESCONOCIMIENTO';
const DEFAULT_CONFIDENCE = 'DUDABA';

// El borrador admite campos vacios para poder completarlos en la vista previa.
// La validacion de negocio se aplica al guardar, con errorInputSchema.
export const importDraftSchema = z.object({
  itemRef: z.union([z.string(), z.number()]).nullish().transform((v) => String(v ?? '')),
  prompt: z.string().default(''),
  myAnswer: z.string().nullish().transform((v) => v ?? ''),
  correctAnswer: z.string().default(''),
  ruleNote: z.string().default(''),
  cause: z.string().default(DEFAULT_CAUSE),
  category: z.string().default(''),
  subcategory: z.string().nullish().transform((v) => v ?? ''),
  confidence: z.string().default(DEFAULT_CONFIDENCE),
  lateInSession: z.boolean().default(false),
  ankiAdded: z.boolean().default(false),
});

export type ImportDraft = z.infer<typeof importDraftSchema>;

export const importBatchSchema = z.array(importDraftSchema).min(1).max(MAX_IMPORT_ROWS);
export const sessionImportRowsSchema = z.array(importDraftSchema).max(MAX_SESSION_IMPORT_ROWS, {
  error: `El bloque admite como máximo ${String(MAX_SESSION_IMPORT_ROWS)} errores. Divide la tanda en partes.`,
});

/** Ambos validadores identifican la posición enviada, con o sin el prefijo del sobre. */
export function errorsForRow(fieldErrors: Record<string, string[]>, position: number): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    const prefix = [`${String(position)}.`, `errors.${String(position)}.`].find((value) => key.startsWith(value));
    if (prefix !== undefined) (result[key.slice(prefix.length)] ??= []).push(...messages);
  }
  return result;
}

const columns = [
  'itemRef', 'prompt', 'myAnswer', 'correctAnswer', 'category', 'ruleNote',
  'cause', 'confidence', 'subcategory',
] as const;

const headers: Readonly<Record<string, string>> = {
  item: 'itemRef', itemref: 'itemRef', enunciado: 'prompt', prompt: 'prompt',
  mirespuesta: 'myAnswer', myanswer: 'myAnswer', correcta: 'correctAnswer',
  respuestacorrecta: 'correctAnswer', correctanswer: 'correctAnswer',
  categoria: 'category', category: 'category', regla: 'ruleNote', rulenote: 'ruleNote',
  causa: 'cause', cause: 'cause', confianza: 'confidence', confidence: 'confidence',
  subcategoria: 'subcategory', subcategory: 'subcategory',
};

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}

/** Lee tabulaciones de una hoja de calculo, incluidas celdas con saltos de linea. */
function readTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (quoted || cell === '') quoted = !quoted;
      else cell += char;
    } else if (!quoted && (char === '\t' || char === '\n')) {
      row.push(cell);
      cell = '';
      if (char === '\n') { rows.push(row); row = []; }
    } else cell += char;
  }
  if (quoted) throw new Error('Hay una celda con comillas sin cerrar. Copia de nuevo la tabla completa.');
  row.push(cell);
  rows.push(row);
  return rows.filter((values) => values.some((value) => value.trim() !== ''));
}

export interface ImportedBatch { session: ImportedSession | null; errors: ImportDraft[] }

export function parseImportedBatch(source: string, today = toIsoDate(new Date())): ImportedBatch {
  if (source.length > MAX_IMPORT_LENGTH) throw new Error('El texto es demasiado largo. Divide la importacion en tandas mas pequeñas.');
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '')
    .replace(/^\s*```(?:json|tsv)?[^\S\n]*\n/i, '').replace(/\n```\s*$/, '');
  if (text.trim() === '') throw new Error('Pega primero tus errores.');
  let data: unknown;
  let session: ImportedSession | null = null;
  if (text.trimStart().startsWith('[') || text.trimStart().startsWith('{')) {
    try { data = JSON.parse(text); }
    catch { throw new Error('El bloque esta incompleto o no es JSON valido. Copia la respuesta completa de la IA.'); }
    if (data !== null && typeof data === 'object' && !Array.isArray(data) && ('errors' in data || 'session' in data)) {
      if ('errors' in data && !('session' in data)) data = data.errors;
      else {
        const envelope = importEnvelopeSchema(today).safeParse(data, importParseOptions);
        if (!envelope.success) throw new Error(`Sobre inválido. ${importIssues(envelope.error)}`);
        session = envelope.data.session;
        data = envelope.data.errors;
      }
    } else if (!Array.isArray(data)) data = [data];
  } else {
    if (!text.includes('\t')) throw new Error('Para texto libre, usa «Copiar instrucciones para la IA» y pega aqui su respuesta. Tambien puedes pegar filas de una hoja de calculo.');
    const rows = readTable(text);
    const first = rows[0] ?? [];
    const mapped = first.map((cell) => headers[normalize(cell).toLowerCase().replace(/[\s_]/g, '')]);
    const hasHeader = mapped.includes('prompt') && mapped.includes('correctAnswer');
    const fields = hasHeader ? mapped : columns;
    if (hasHeader && (fields.some((field) => field === undefined) || new Set(fields).size !== fields.length)) {
      throw new Error('Hay columnas desconocidas o repetidas. Usa las cabeceras de la plantilla.');
    }
    data = (hasHeader ? rows.slice(1) : rows).map((values, index) => {
      if (values.length !== fields.length && (hasHeader || values.length !== 6)) {
        throw new Error(`Fila ${String(index + 1)}: usa las 6 columnas de la plantilla o incluye cabeceras.`);
      }
      return Object.fromEntries(values.map((value, i) => [fields[i], value]));
    });
  }
  // El sobre admite mas filas que el array suelto: el aviso tiene que decir su propio limite.
  const limit = session === null ? MAX_IMPORT_ROWS : MAX_SESSION_IMPORT_ROWS;
  const parsed = (session === null ? importBatchSchema : sessionImportRowsSchema).safeParse(data, importParseOptions);
  if (!parsed.success) {
    throw new Error(`Se esperan entre 1 y ${String(limit)} errores con campos de texto. Comprueba que has copiado el bloque completo.`);
  }
  const errors = parsed.data.map((row, index) => {
    // Una celda en blanco de Causa o Confianza equivale a no traer la columna: vale la propuesta.
    const cause = normalize(row.cause) || DEFAULT_CAUSE;
    const confidence = normalize(row.confidence) || DEFAULT_CONFIDENCE;
    if (!CAUSES.some((value) => value === cause) || !CONFIDENCES.some((value) => value === confidence)) {
      throw new Error(`Error ${String(index + 1)}: causa o confianza no reconocida. Usa los valores de las instrucciones.`);
    }
    return { ...row, cause, confidence, category: normalize(row.category).replace(/\s+/g, '_') };
  });
  return { session, errors };
}

export const IMPORT_TEMPLATE = 'Item\tEnunciado\tMi respuesta\tCorrecta\tCategoria\tRegla\n4\tThey called ___ the meeting.\tof\toff\tPHRASAL_VERB\tCall off significa cancelar; se escribe con doble f.';

export const IMPORT_PROMPT = `Convierte en JSON las correcciones de ingles que pegue o adjunte como fotos o capturas, para importarlas en mi Error Log C1. Procesa una sola sesion de practica por tanda: todos los errores deben pertenecer a esa misma sesion.

FORMATO DE SALIDA

Devuelve exclusivamente este objeto JSON, sin Markdown, sin bloques de codigo y sin explicaciones antes ni despues. Respeta los tipos del ejemplo: part, itemsTotal e itemsCorrect son numeros o null, nunca cadenas; timed es booleano; los campos de cada error son cadenas.

{
  "session": {
    "date": "2026-09-15",
    "kind": "DRILL",
    "paper": null,
    "part": null,
    "source": "LIBRO",
    "sourceRef": "Ready for C1 Advanced, pag. 6, ejercicios 1-5",
    "itemsTotal": 8,
    "itemsCorrect": 6,
    "timed": false
  },
  "errors": [
    {
      "itemRef": "4",
      "prompt": "They called ___ the meeting.",
      "myAnswer": "of",
      "correctAnswer": "off",
      "category": "PHRASAL_VERB",
      "subcategory": "",
      "ruleNote": "Call off significa cancelar; se escribe con doble f."
    }
  ]
}

Valores admitidos, exactamente como se escriben aqui:
- kind: ${SESSION_KINDS.join(', ')}.
- paper: ${PAPERS.join(', ')}, o null.
- part: entero positivo, o null.
- source: ${SOURCES.join(', ')}.
- category: ${CATEGORIES.join(', ')}.

Añade a un error las claves opcionales cause (${CAUSES.join(', ')}) y confidence (${CONFIDENCES.join(', ')}) SOLO si yo las he indicado expresamente para ese error. No las deduzcas por el tipo de fallo ni por haber respondido mal; si faltan, el formulario propondra DESCONOCIMIENTO y DUDABA y yo los revisare.

QUE NO DEBES INVENTAR

Un dato inventado no se distingue de uno real y se queda en mi historial. Ante la duda, deja "" o null.

- No inventes pagina, unidad, paper, part, sourceRef, itemsTotal, itemsCorrect ni nada sobre el tiempo. Conserva tal cual los datos de sesion que yo te de.
- No deduzcas paper ni part por el tipo de ejercicio. Calcula itemsCorrect solo si consta la sesion entera con todos sus errores.
- Transcribe myAnswer exactamente, con su ortografia original: no la corrijas al copiarla.
- correctAnswer solo puede salir del solucionario o de una correccion visible. Si no la hay, dejala como "".
- Incluye solo lo que yo señale, lo marcado como incorrecto o lo que puedas comparar con una correccion fiable. No conviertas en errores todos los ejercicios de la foto.
- Si un texto no se lee con claridad, dejalo como "" para que yo lo revise. Nunca escribas "ilegible" ni "pendiente" en su lugar.
- Si no puedes identificar que he fallado, pideme mis respuestas, el solucionario o una captura mejor antes de generar nada.

LECTURA Y DETALLE

- Relaciona cada respuesta con su numero de ejercicio y su enunciado, conservando huecos, puntuacion y ortografia.
- prompt lleva el enunciado necesario para entender el error, con sus opciones o instrucciones si hacen falta.
- ruleNote explica en español, breve y concreta, la regla o criterio que evita repetir el error: al menos 15 caracteres y sin limitarse a repetir correctAnswer. Si no puedes justificar una regla util, dejala como "".
- subcategory afina la categoria cuando aporte algo; si no, "".
- itemRef es el identificador tal como aparece. Dos actividades distintas pueden repetir numero: conserva el de cada una y distinguelas por el prompt.
- Si varias capturas se solapan, incluye cada error una sola vez. Como maximo ${String(MAX_SESSION_IMPORT_ROWS)} errores por sesion.

Datos de la sesion y correcciones (texto o imagenes adjuntas):
`;
