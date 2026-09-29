import { getDb } from './client';
import { rebuildNotebookSearch } from './notebookSearch';

const count = rebuildNotebookSearch(getDb());
console.log(`Índice Notebook reconstruido: ${String(count)} apuntes.`);
