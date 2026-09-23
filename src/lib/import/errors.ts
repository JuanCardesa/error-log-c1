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
  const parsed = (session === null ? importBatchSchema : sessionImportRowsSchema).safeParse(data, importParseOptions);
  if (!parsed.success) {
    throw new Error(`Se esperan entre 1 y ${String(MAX_IMPORT_ROWS)} errores con campos de texto. Comprueba que has copiado el bloque completo.`);
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

export const IMPORT_PROMPT = `Convierte las correcciones de ingles que pegue o adjunte como fotos o capturas de pantalla en una sesion de practica para mi Error Log C1, incluyendo tanto los datos de la sesion como los errores cometidos.

Las imagenes pueden incluir el ejercicio, mis respuestas, anotaciones del profesor y el solucionario. Procesa una sola sesion de practica por tanda. Todos los errores incluidos en "errors" deben pertenecer a esa misma sesion.

DATOS DE LA SESION

La salida debe incluir un objeto "session" con estas claves:

- date: fecha de la sesion en formato YYYY-MM-DD.
- kind: tipo de practica, por ejemplo DRILL cuando sean ejercicios individuales o de un libro.
- paper: paper del Cambridge C1 si corresponde. Si no corresponde o no consta, usa null.
- part: parte concreta del paper si corresponde. Si no corresponde o no consta, usa null.
- source: origen de la practica, por ejemplo LIBRO cuando proceda de un libro.
- sourceRef: referencia concreta de la fuente, pagina, unidad, test o identificador si consta. Si no consta, usa null.
- itemsTotal: numero total de ejercicios o items realizados en esa sesion.
- itemsCorrect: numero total de items correctos.
- timed: true solo si consta que la practica se hizo con tiempo o bajo limite de tiempo; en caso contrario, false si se ha indicado expresamente que no fue cronometrada.

Reglas para los datos de la sesion:
- Conserva exactamente los datos de sesion que yo proporcione.
- No inventes una pagina, unidad, paper, part, sourceRef ni ningun otro dato que no aparezca.
- No deduzcas paper o part solo por el tipo de ejercicio si no se ha indicado claramente.
- No inventes itemsTotal ni itemsCorrect a partir de una imagen parcial.
- Calcula itemsCorrect a partir de itemsTotal y los errores SOLO cuando este claro que se han proporcionado todos los ejercicios de la sesion y todos los errores cometidos.
- Si yo proporciono explicitamente itemsTotal o itemsCorrect, conserva esos valores y no los modifiques por tu cuenta.
- No inventes datos sobre tiempo de realizacion.
- Si falta un dato opcional de la sesion, usa null cuando corresponda.
- No mezcles ejercicios pertenecientes a sesiones diferentes.

LECTURA DE LOS EJERCICIOS Y CORRECCIONES

- Relaciona cada respuesta con su numero de ejercicio y su enunciado. Conserva huecos, puntuacion y ortografia; no corrijas mi respuesta al transcribirla.
- Distingue el texto impreso, mi respuesta y la correccion.
- Usa el solucionario o una correccion visible para correctAnswer; no presentes una solucion que hayas deducido como si viniera del solucionario.
- Incluye solo los errores que yo señale, que esten marcados como incorrectos o que puedas identificar comparando mi respuesta legible con una correccion fiable.
- No conviertas todos los ejercicios de la foto en errores.
- Si un dato no se lee con claridad, dejalo como "" para revisarlo. No rellenes palabras borrosas por intuicion ni uses textos como "ilegible" o "pendiente" en su lugar.
- Si no puedes identificar que ejercicios he fallado, pide mis respuestas, el solucionario o una captura mas clara antes de generar el bloque.
- Si varias capturas se solapan, incluye cada error una sola vez.
- Comprueba que no mezclas numeros de ejercicios de paginas, actividades o sesiones distintas.
- Dos actividades distintas pueden tener el mismo numero de ejercicio. En ese caso, conserva el itemRef que aparece en cada actividad y utiliza el prompt completo para diferenciarlas.

ERRORES

Cada objeto dentro de "errors" debe contener estas claves:

itemRef, prompt, myAnswer, correctAnswer, category, ruleNote, subcategory.

Todos los valores de cada error son texto.

- itemRef: numero, letra o identificador del ejercicio tal como aparece.
- prompt: conserva el enunciado necesario para entender el error. Incluye las opciones o instrucciones cuando sean relevantes para interpretar la respuesta.
- myAnswer: conserva exactamente mi respuesta, incluida su ortografia original.
- correctAnswer: conserva exactamente la correccion fiable mostrada en el solucionario o correccion.
- category: clasifica el error usando exclusivamente una de estas categorias: ${CATEGORIES.join(', ')}.
- ruleNote: explica en español, de forma breve, concreta y util, la regla, colocacion, estructura o criterio que me ayudara a no repetir el error. Debe tener al menos 15 caracteres y no limitarse a repetir correctAnswer.
- subcategory: clasificacion mas especifica del error cuando sea util. Puede ser "".

Si no consta mi respuesta o el numero de item, usa "".
No inventes respuestas ni errores.
Si falta una correccion fiable, deja correctAnswer como "" para que yo lo complete.
Si no puedes justificar con seguridad una regla util para ruleNote, dejala como "".

CAUSE Y CONFIDENCE

Incluye cause y confidence en un error SOLO si yo los he indicado expresamente para ese error.

cause admite exclusivamente:
${CAUSES.join(', ')}.

confidence admite exclusivamente:
${CONFIDENCES.join(', ')}.

No deduzcas mi estado mental por una respuesta incorrecta.
No deduzcas cause ni confidence basandote en el tipo de fallo.
Si faltan, no incluyas esas claves; el formulario propondra DESCONOCIMIENTO y DUDABA y yo los revisare.

FORMATO DE SALIDA

Cuando tengas informacion suficiente, devuelve exclusivamente JSON valido, sin Markdown, sin bloques de codigo y sin explicaciones antes o despues.

La raiz debe ser SIEMPRE un objeto con exactamente esta estructura general:

{
  "session": {
    "date": "YYYY-MM-DD",
    "kind": "...",
    "paper": null,
    "part": null,
    "source": "...",
    "sourceRef": null,
    "itemsTotal": 0,
    "itemsCorrect": 0,
    "timed": false
  },
  "errors": [
    {
      "itemRef": "",
      "prompt": "",
      "myAnswer": "",
      "correctAnswer": "",
      "category": "",
      "ruleNote": "",
      "subcategory": ""
    }
  ]
}

Respeta los tipos JSON:
- date, kind y source son strings.
- paper, part y sourceRef pueden ser string o null.
- itemsTotal e itemsCorrect son numeros, no strings.
- timed es booleano, no string.
- errors es un array.
- Los campos internos de cada error son strings, salvo las claves opcionales cause y confidence, que tambien son strings.

No devuelvas solamente el array "errors": la sesion debe incluirse siempre.
No marques tarjetas como añadidas.
No inventes identificadores internos ni datos sobre tiempo.
Agrupa como maximo ${String(MAX_IMPORT_ROWS)} errores dentro de una misma sesion.
No incluyas ejemplos inventados ni ejercicios correctos dentro de "errors": procesa solo mi sesion y mis correcciones.

Datos de la sesion y correcciones (texto o imagenes adjuntas):
`;
