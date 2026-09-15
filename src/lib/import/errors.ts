import { z } from 'zod';

import { CATEGORIES, CAUSES, CONFIDENCES } from '../domain/enums';

export const MAX_IMPORT_ROWS = 100;
export const MAX_IMPORT_LENGTH = 200_000;

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

export function parseImportedErrors(source: string): ImportDraft[] {
  if (source.length > MAX_IMPORT_LENGTH) throw new Error('El texto es demasiado largo. Divide la importacion en tandas mas pequeñas.');
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '')
    .replace(/^\s*```(?:json|tsv)?[^\S\n]*\n/i, '').replace(/\n```\s*$/, '');
  if (text.trim() === '') throw new Error('Pega primero tus errores.');
  let data: unknown;
  if (text.trimStart().startsWith('[') || text.trimStart().startsWith('{')) {
    try { data = JSON.parse(text); }
    catch { throw new Error('El bloque esta incompleto o no es JSON valido. Copia la respuesta completa de la IA.'); }
    if (!Array.isArray(data)) data = [data];
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
  const parsed = importBatchSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Se esperan entre 1 y ${String(MAX_IMPORT_ROWS)} errores con campos de texto. Comprueba que has copiado el bloque completo.`);
  }
  return parsed.data.map((row, index) => {
    // Una celda en blanco de Causa o Confianza equivale a no traer la columna: vale la propuesta.
    const cause = normalize(row.cause) || DEFAULT_CAUSE;
    const confidence = normalize(row.confidence) || DEFAULT_CONFIDENCE;
    if (!CAUSES.some((value) => value === cause) || !CONFIDENCES.some((value) => value === confidence)) {
      throw new Error(`Error ${String(index + 1)}: causa o confianza no reconocida. Usa los valores de las instrucciones.`);
    }
    return { ...row, cause, confidence, category: normalize(row.category).replace(/\s+/g, '_') };
  });
}

export const IMPORT_TEMPLATE = 'Item\tEnunciado\tMi respuesta\tCorrecta\tCategoria\tRegla\n4\tThey called ___ the meeting.\tof\toff\tPHRASAL_VERB\tCall off significa cancelar; se escribe con doble f.';

export const IMPORT_PROMPT = `Convierte las correcciones de ingles que pegue o adjunte como fotos o capturas de pantalla en errores para mi Error Log C1.
Las imagenes pueden incluir el ejercicio, mis respuestas, anotaciones del profesor y el solucionario. Procesa una sola sesion de practica por tanda.
Para leer las imagenes:
- Relaciona cada respuesta con su numero de ejercicio y su enunciado. Conserva huecos, puntuacion y ortografia; no corrijas mi respuesta al transcribirla.
- Distingue el texto impreso, mi respuesta y la correccion. Usa el solucionario o una correccion visible para correctAnswer; no presentes una solucion que hayas deducido como si viniera del solucionario.
- Incluye solo los errores que yo señale, que esten marcados como incorrectos o que puedas identificar comparando mi respuesta legible con una correccion fiable. No conviertas todos los ejercicios de la foto en errores.
- Si un dato no se lee con claridad, dejalo como "" para revisarlo. No rellenes palabras borrosas por intuicion ni uses textos como "ilegible" o "pendiente" en su lugar.
- Si no puedes identificar que ejercicios he fallado, pide mis respuestas, el solucionario o una captura mas clara antes de generar el bloque.
- Si varias capturas se solapan, incluye cada error una sola vez. Comprueba que no mezclas numeros de ejercicios de paginas distintas.
Cuando tengas informacion suficiente, devuelve solo un array JSON, sin explicaciones externas, con un objeto por error y estas claves:
itemRef, prompt, myAnswer, correctAnswer, category, ruleNote, subcategory.
Todos los valores son texto. Conserva el enunciado, mi respuesta y la correccion tal como aparecen. Si no consta mi respuesta o el numero de item, usa "". No inventes respuestas ni errores. Si falta una correccion fiable, deja correctAnswer vacio para que yo lo complete.
category debe ser una de: ${CATEGORIES.join(', ')}.
ruleNote: explica en español, de forma breve y util, la regla que evita repetir el error (minimo 15 caracteres, distinta de la respuesta). Si no puedes justificarla, dejala vacia para que yo la complete. subcategory es opcional y puede ser "".
Incluye cause y confidence SOLO si yo las he indicado: cause admite ${CAUSES.join(', ')}; confidence admite ${CONFIDENCES.join(', ')}. No deduzcas mi estado mental por una respuesta incorrecta. Si faltan, el formulario propondra DESCONOCIMIENTO y DUDABA y yo los revisare.
No marques tarjetas como añadidas ni inventes datos sobre tiempo.
Agrupa como maximo ${String(MAX_IMPORT_ROWS)} errores. No incluyas ejemplos: procesa solo mis correcciones.

Mis correcciones (texto o imagenes adjuntas):
`;
