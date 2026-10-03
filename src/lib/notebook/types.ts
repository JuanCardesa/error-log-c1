import type { ErrorRow } from '../domain/types';

/** Filas de Notebook independientes de Drizzle y de los formularios. */
export interface NotebookFolder {
  readonly id: number;
  readonly parentId: number | null;
  readonly name: string;
  readonly nameKey: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface NotebookNote {
  readonly id: number;
  readonly uid: string;
  readonly folderId: number | null;
  readonly title: string;
  readonly contentMarkdown: string;
  readonly tags: readonly string[];
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type NotebookNoteSummary = Omit<NotebookNote, 'contentMarkdown'>;

export interface NotebookHeading {
  readonly depth: 1 | 2 | 3 | 4 | 5 | 6;
  readonly text: string;
  readonly slug: string;
}

export interface NotebookMarkdownLink {
  readonly text: string;
  readonly url: string;
}

export interface NotebookOutline {
  readonly revision: number;
  readonly headings: readonly NotebookHeading[];
}

export interface NotebookCreateResult {
  readonly note: NotebookNote;
  readonly created: boolean;
}

export interface NotebookErrorLink {
  readonly errorId: number;
  readonly noteId: number;
  readonly headingSlug: string | null;
  readonly headingText: string | null;
  readonly createdAt: string;
}

export type NotebookLinkHeadingStatus = 'none' | 'valid' | 'changed';

export interface NotebookLinkedNote {
  readonly link: NotebookErrorLink;
  readonly note: NotebookNoteSummary;
  readonly headingStatus: NotebookLinkHeadingStatus;
}

export interface NotebookLinkedError {
  readonly link: NotebookErrorLink;
  readonly error: ErrorRow;
  readonly headingStatus: NotebookLinkHeadingStatus;
}

export interface NotebookPage<T> {
  readonly items: readonly T[];
  readonly hasMore: boolean;
}

export type NotebookErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_PARENT'
  | 'FOLDER_NOT_EMPTY'
  | 'PERSISTENCE';

export type NotebookResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly code: NotebookErrorCode;
      readonly message: string;
      readonly fieldErrors?: Readonly<Record<string, readonly string[]>>;
      readonly current?: NotebookNote;
    };
