import { createHash } from 'node:crypto';

import { isMap, isScalar, isSeq, parseDocument, visit, type Node } from 'yaml';

import type { Messages } from '../i18n';
import { inspectNotebookMarkdown } from './markdown';
import {
  NOTEBOOK_LIMITS, notebookContentSchema, notebookImportSizeError, notebookTagSchema, notebookTitleSchema,
} from './schemas';
import { classifyNotebookUrl } from './urls';

/**
 * Importación de un `.md` por operación. Solo servidor. Todo es puro para poder repetirlo
 * al confirmar: la vista previa del navegador nunca decide qué se guarda.
 *
 * El frontmatter se interpreta con YAML failsafe (todo es texto), sin alias ni etiquetas
 * `!…`. Si no se puede interpretar, no se tira: se conserva como texto al principio del
 * apunte y se avisa. Los campos desconocidos se enseñan antes de descartarlos.
 */

const EXTENSION = /\.(?:md|markdown)$/iu;

/** Metadatos que escribe la exportación de Notebook y que un apunte nuevo no hereda. */
const EXPORT_FIELDS = new Set(['notebook_uid', 'created_at', 'updated_at']);
const FAILSAFE_TAGS = new Set(['tag:yaml.org,2002:str', 'tag:yaml.org,2002:seq', 'tag:yaml.org,2002:map']);
const OPENING = /^---[ \t]*\r?\n/u;
const CLOSING = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/gmu;
const LEADING_BLANK_LINES = /^(?:[ \t]*\r?\n)+/u;
const CONTROL = /[\u0000-\u001f\u007f]/gu;
const MULTILINE_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

export type NotebookImportTitleSource = 'frontmatter' | 'heading' | 'file';
/** `kept`: había frontmatter pero no se interpretó; sigue dentro del cuerpo. */
export type NotebookImportFrontmatter = 'none' | 'applied' | 'kept';

export type NotebookImportWarningCode =
  | 'FRONTMATTER_KEPT'
  | 'TITLE_INVALID'
  | 'TITLE_TRUNCATED'
  | 'TAGS_INVALID'
  | 'TAGS_DUPLICATED'
  | 'TAGS_TRUNCATED'
  | 'HTML'
  | 'IMAGES'
  | 'INVALID_LINKS'
  | 'EXTERNAL_TARGETS'
  | 'MISSING_ANCHORS';

export interface NotebookImportWarning {
  readonly code: NotebookImportWarningCode;
  readonly message: string;
}

export interface NotebookImportDraft {
  readonly fileName: string;
  readonly title: string;
  readonly titleSource: NotebookImportTitleSource;
  readonly tags: readonly string[];
  readonly contentMarkdown: string;
  /** Huella del cuerpo: al confirmar se comprueba que el archivo no cambió desde la vista previa. */
  readonly contentHash: string;
  readonly frontmatter: NotebookImportFrontmatter;
  /** Claves que Notebook no conoce: se enseñan y no se guardan. */
  readonly unknownFields: readonly string[];
  /** Metadatos de otra exportación que no se aplican: el apunte importado es nuevo. */
  readonly ignoredFields: readonly string[];
  readonly warnings: readonly NotebookImportWarning[];
}

export type NotebookImportParse =
  | { readonly ok: true; readonly draft: NotebookImportDraft }
  | { readonly ok: false; readonly message: string };

interface Frontmatter {
  readonly state: NotebookImportFrontmatter;
  readonly body: string;
  readonly title: string | null;
  readonly tags: readonly string[];
  /** Valores de `tags` que no son texto: se enseñan como descartados. */
  readonly rejectedTags: readonly string[];
  readonly unknownFields: readonly string[];
  readonly ignoredFields: readonly string[];
  readonly warnings: readonly NotebookImportWarning[];
}

function kept(text: string, reason: string, t: Messages): Frontmatter {
  return {
    state: 'kept', body: text, title: null, tags: [], rejectedTags: [], unknownFields: [], ignoredFields: [],
    warnings: [{ code: 'FRONTMATTER_KEPT', message: t.notebookImport.kept(reason) }],
  };
}

function scalarText(node: unknown): string | null {
  return isScalar(node) && typeof node.value === 'string' ? node.value : null;
}

function readFrontmatter(text: string, t: Messages): Frontmatter {
  const m = t.notebookImport;
  const opening = OPENING.exec(text);
  if (opening === null) {
    return { state: 'none', body: text, title: null, tags: [], rejectedTags: [], unknownFields: [], ignoredFields: [], warnings: [] };
  }
  CLOSING.lastIndex = opening[0].length;
  const closing = CLOSING.exec(text);
  if (closing === null) return kept(text, m.frontmatterUnclosed, t);

  const source = text.slice(opening[0].length, closing.index);
  if (new TextEncoder().encode(source).length > NOTEBOOK_LIMITS.frontmatterBytes) {
    return kept(text, m.frontmatterTooBig(NOTEBOOK_LIMITS.frontmatterBytes / 1024), t);
  }

  const doc = parseDocument(source, { schema: 'failsafe', uniqueKeys: true });
  const [error] = doc.errors;
  if (error !== undefined) {
    // +1: la primera línea del archivo es el `---` de apertura.
    const line = error.linePos?.[0].line;
    return kept(text, m.frontmatterInvalid(line === undefined ? null : line + 1), t);
  }
  let aliases = false;
  let customTags = false;
  visit(doc, {
    Alias() { aliases = true; return visit.BREAK; },
    Node(_key, node) { if (node.tag !== undefined && !FAILSAFE_TAGS.has(node.tag)) customTags = true; },
  });
  if (aliases) return kept(text, m.frontmatterAliases, t);
  if (customTags || doc.warnings.length > 0) return kept(text, m.frontmatterTags, t);
  const contents = doc.contents;
  if (contents !== null && !isMap(contents)) {
    return kept(text, m.frontmatterNotMap, t);
  }

  let title: string | null = null;
  const tags: string[] = [];
  const rejectedTags: string[] = [];
  const unknownFields: string[] = [];
  const ignoredFields: string[] = [];
  const warnings: NotebookImportWarning[] = [];
  for (const pair of contents?.items ?? []) {
    const key = scalarText(pair.key) ?? String(pair.key);
    const value = pair.value as Node | null;
    if (key === 'title') {
      title = scalarText(value);
      if (title === null && value !== null) {
        warnings.push({ code: 'TITLE_INVALID', message: m.titleInvalid });
      }
    } else if (key === 'tags') {
      const single = scalarText(value);
      if (isSeq(value)) {
        for (const item of value.items) {
          const tag = scalarText(item);
          if (tag === null) rejectedTags.push(String(item));
          else tags.push(tag);
        }
      } else if (single !== null) {
        // `tags: gramática, part4` es habitual fuera de Notebook.
        tags.push(...single.split(','));
      } else if (value !== null) {
        rejectedTags.push(String(value));
      }
    } else if (EXPORT_FIELDS.has(key)) {
      ignoredFields.push(key);
    } else {
      unknownFields.push(key);
    }
  }

  return {
    state: 'applied',
    body: text.slice(closing.index + closing[0].length).replace(LEADING_BLANK_LINES, ''),
    title, tags, rejectedTags, unknownFields, ignoredFields, warnings,
  };
}

function cleanText(value: string): string {
  return value.normalize('NFC').replace(/\s+/gu, ' ').replace(CONTROL, '').trim();
}

function proposeTitle(candidates: ReadonlyArray<readonly [NotebookImportTitleSource, string | null]>, t: Messages): {
  title: string; source: NotebookImportTitleSource; warnings: NotebookImportWarning[];
} {
  for (const [source, raw] of candidates) {
    const cleaned = raw === null ? '' : cleanText(raw);
    if (cleaned === '') continue;
    const characters = Array.from(cleaned);
    if (characters.length <= NOTEBOOK_LIMITS.title) return { title: cleaned, source, warnings: [] };
    return {
      title: characters.slice(0, NOTEBOOK_LIMITS.title).join('').trimEnd(),
      source,
      warnings: [{
        code: 'TITLE_TRUNCATED',
        message: t.notebookImport.titleTruncated(NOTEBOOK_LIMITS.title),
      }],
    };
  }
  return { title: t.notebookImport.fallbackTitle, source: 'file', warnings: [] };
}

function shortened(value: string): string {
  const characters = Array.from(cleanText(value));
  return characters.length > NOTEBOOK_LIMITS.tagLength
    ? `${characters.slice(0, NOTEBOOK_LIMITS.tagLength).join('')}…`
    : characters.join('');
}

function normalizeTags(raw: readonly string[], rejected: readonly string[], t: Messages): { tags: string[]; warnings: NotebookImportWarning[] } {
  const tags: string[] = [];
  const invalid = rejected.map(shortened);
  let duplicated = false;
  for (const value of raw) {
    if (value.trim() === '') continue;
    const parsed = notebookTagSchema.safeParse(value);
    if (!parsed.success) {
      invalid.push(shortened(value));
    } else if (tags.includes(parsed.data)) {
      duplicated = true;
    } else {
      tags.push(parsed.data);
    }
  }
  const warnings: NotebookImportWarning[] = [];
  if (invalid.length > 0) {
    warnings.push({
      code: 'TAGS_INVALID',
      message: t.notebookImport.tagsInvalid(invalid.length, NOTEBOOK_LIMITS.tagLength, invalid.join(', ')),
    });
  }
  if (duplicated) {
    warnings.push({ code: 'TAGS_DUPLICATED', message: t.notebookImport.tagsDuplicated });
  }
  if (tags.length > NOTEBOOK_LIMITS.tagCount) {
    warnings.push({ code: 'TAGS_TRUNCATED', message: t.notebookImport.tagsTruncated(NOTEBOOK_LIMITS.tagCount) });
  }
  return { tags: tags.slice(0, NOTEBOOK_LIMITS.tagCount), warnings };
}

function contentWarnings(markdown: string, t: Messages): { warnings: NotebookImportWarning[]; firstH1: string | null } {
  const m = t.notebookImport;
  const inspection = inspectNotebookMarkdown(markdown);
  const slugs = new Set(inspection.headings.map((heading) => heading.slug));
  let invalidLinks = 0;
  let externalTargets = 0;
  let missingAnchors = 0;
  for (const link of inspection.links) {
    const target = classifyNotebookUrl(link.url);
    if (target.kind === 'invalid') {
      invalidLinks += 1;
    } else if (target.kind === 'internal') {
      if (!target.href.startsWith('#')) {
        externalTargets += 1;
      } else {
        let anchor = target.href.slice(1);
        try { anchor = decodeURIComponent(anchor); } catch { /* se compara tal cual */ }
        if (!slugs.has(anchor)) missingAnchors += 1;
      }
    }
  }

  const warnings: NotebookImportWarning[] = [];
  if (inspection.htmlCount > 0) warnings.push({ code: 'HTML', message: m.html(inspection.htmlCount) });
  if (inspection.imageCount > 0) warnings.push({ code: 'IMAGES', message: m.images(inspection.imageCount) });
  if (invalidLinks > 0) warnings.push({ code: 'INVALID_LINKS', message: m.invalidLinks(invalidLinks) });
  if (externalTargets > 0) warnings.push({ code: 'EXTERNAL_TARGETS', message: m.externalTargets(externalTargets) });
  if (missingAnchors > 0) warnings.push({ code: 'MISSING_ANCHORS', message: m.missingAnchors(missingAnchors) });
  const firstH1 = inspection.headings.find((heading) => heading.depth === 1)?.text ?? null;
  return { warnings, firstH1 };
}

export function notebookImportContentHash(markdown: string): string {
  return createHash('sha256').update(markdown, 'utf8').digest('hex');
}

/**
 * `fileName` puede venir con ruta: el servidor no se fía del nombre que manda el navegador.
 * Los avisos y el título de reserva se redactan con `t`; el contenido del archivo, no.
 */
export function parseNotebookMarkdownImport(fileName: string, bytes: Uint8Array, t: Messages): NotebookImportParse {
  const m = t.notebookImport;
  const baseName = fileName.split(/[\\/]/u).pop() ?? '';
  if (!EXTENSION.test(baseName)) return { ok: false, message: m.wrongExtension };
  const sizeError = notebookImportSizeError(bytes.length, t);
  if (sizeError !== null) return { ok: false, message: sizeError };

  let text: string;
  try {
    // Sin `ignoreBOM`, el decodificador quita la marca UTF-8 inicial.
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, message: m.notUtf8 };
  }

  const frontmatter = readFrontmatter(text, t);
  const body = frontmatter.body;
  if (new TextEncoder().encode(body).length > NOTEBOOK_LIMITS.contentBytes) {
    return { ok: false, message: m.contentTooBig(NOTEBOOK_LIMITS.contentBytes / 1024) };
  }
  if (MULTILINE_CONTROL.test(body)) {
    return { ok: false, message: m.controlChars };
  }
  const content = notebookContentSchema.safeParse(body);
  if (!content.success) return { ok: false, message: m.notImportable };

  const { warnings: bodyWarnings, firstH1 } = contentWarnings(content.data, t);
  const proposed = proposeTitle([
    ['frontmatter', frontmatter.title],
    ['heading', firstH1],
    ['file', baseName.replace(EXTENSION, '')],
  ], t);
  const titleCheck = notebookTitleSchema.safeParse(proposed.title);
  const tags = normalizeTags(frontmatter.tags, frontmatter.rejectedTags, t);

  return {
    ok: true,
    draft: {
      fileName: baseName,
      title: titleCheck.success ? titleCheck.data : m.fallbackTitle,
      titleSource: proposed.source,
      tags: tags.tags,
      contentMarkdown: content.data,
      contentHash: notebookImportContentHash(content.data),
      frontmatter: frontmatter.state,
      unknownFields: frontmatter.unknownFields,
      ignoredFields: frontmatter.ignoredFields,
      warnings: [...frontmatter.warnings, ...proposed.warnings, ...tags.warnings, ...bodyWarnings],
    },
  };
}
