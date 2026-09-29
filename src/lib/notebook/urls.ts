import { slug as githubSlug } from 'github-slugger';

/** El ID conserva el enlace aunque cambien el título o la carpeta. */
export function notebookNoteHref(note: { readonly id: number; readonly title: string }): string {
  const suffix = githubSlug(note.title);
  return `/notebook/${String(note.id)}${suffix === '' ? '' : `-${suffix}`}`;
}

export function parseNotebookNoteId(key: string): number | null {
  const match = /^([1-9]\d*)(?:-[^/]+)?$/u.exec(key);
  if (match === null) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
}

export type NotebookUrl =
  | { readonly kind: 'internal' | 'external'; readonly href: string }
  | { readonly kind: 'invalid' };

const BASE = 'http://notebook.local/notebook/';
const scheme = /^[a-z][a-z\d+.-]*:/iu;

/** Valida destinos del Markdown antes de pasarlos a un componente de enlace. */
export function classifyNotebookUrl(value: string, basePath = '/notebook/'): NotebookUrl {
  const href = value.trim();
  if (!href || /[\u0000-\u001f\u007f\\]/u.test(href) || href.startsWith('//')) {
    return { kind: 'invalid' };
  }

  if (href.startsWith('#')) return { kind: 'internal', href };

  try {
    const url = new URL(href, new URL(basePath, BASE));
    if (scheme.test(href)) {
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        return { kind: 'external', href: url.href };
      }
      if (url.protocol === 'mailto:' && url.pathname) {
        return { kind: 'external', href: url.href };
      }
      return { kind: 'invalid' };
    }
    if (url.origin !== new URL(BASE).origin) return { kind: 'invalid' };
    return { kind: 'internal', href: `${url.pathname}${url.search}${url.hash}` };
  } catch {
    return { kind: 'invalid' };
  }
}
