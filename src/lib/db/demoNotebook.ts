import { randomUUID } from 'node:crypto';

import { analyzeNotebookMarkdown } from '../notebook/markdown';
import { notebookNoteHref } from '../notebook/urls';
import type { Db } from './client';
import { setErrorNoteLink } from './notebookLinkRepo';
import { createNotebookFolder, createNotebookNote } from './notebookRepo';
import { errorRow } from './schema';

/** Cuaderno pequeño, original y exclusivo de la demo; el seed general sigue vacío. */
export function seedDemoNotebook(db: Db, at: string): void {
  const grammar = createNotebookFolder(db, { name: 'Gramática', parentId: null }, at);
  const transformations = createNotebookFolder(db, {
    name: 'Transformaciones', parentId: grammar.id,
  }, at);
  const vocabulary = createNotebookFolder(db, { name: 'Vocabulario', parentId: null }, at);
  const writing = createNotebookFolder(db, { name: 'Writing', parentId: null }, at);

  const add = (title: string, folderId: number | null, tags: string[], contentMarkdown: string) =>
    createNotebookNote(db, {
      uid: randomUUID(), title, folderId, tags, contentMarkdown,
    }, at).note;

  const cleft = add('Oraciones enfáticas con it', transformations.id, ['part4', 'gramática'], `# Oraciones enfáticas con it

## La idea

Una *cleft sentence* destaca una parte de la información: **It was her voice that I recognised**.

## Preposición conservada

> **Regla:** si el complemento necesita una preposición, la oración enfática también la necesita.

| Frase directa | Con énfasis |
| --- | --- |
| I recognised him by his voice. | It was **by his voice** that I recognised him. |
| We met on Monday. | It was **on Monday** that we met. |

Antes de entregar, comprueba qué palabra introduce el complemento en la frase original.
`);
  const cleftHeading = analyzeNotebookMarkdown(cleft.contentMarkdown).headings
    .find((heading) => heading.text === 'Preposición conservada');
  if (cleftHeading === undefined) throw new Error('Falta el apartado de la demo');

  add('Wish para arrepentimientos', transformations.id, ['part4', 'pasado'], `# Wish para arrepentimientos

## Algo que ya ocurrió

**Wish + past perfect** expresa que habría preferido otro resultado: *I wish I had accepted the offer*.

- Identifica el momento de la acción.
- Si ya terminó, usa **had + participio**.
- Conserva el significado de la frase de partida.

Para otra transformación, consulta [las oraciones enfáticas](${notebookNoteHref(cleft)}#${cleftHeading.slug}).
`);

  add('Phrasal verbs separables', vocabulary.id, ['phrasal-verbs', 'part4'], `# Phrasal verbs separables

## Call off

*Call off* significa cancelar. En pasiva: *The meeting was called off*.

La segunda palabra lleva dos efes; **of** por sí solo es otra preposición.
`);

  add('Sufijos de sustantivos', vocabulary.id, ['word-formation'], `# Sufijos de sustantivos

## -ment

*Commit* pasa a *commitment*. No insertes una e antes del sufijo.

## -tion

*Communicate* pasa a *communication*. Revisa las consonantes antes de copiar la respuesta.
`);

  add('Colocaciones para argumentos', vocabulary.id, ['colocaciones', 'writing'], `# Colocaciones para argumentos

## Elegir el verbo

En un ensayo formal se puede **reach a solution** o **find a solution**. Para hablar de una pérdida, **sustain a loss** resulta natural en un registro formal.

Escribe una frase propia con cada pareja y revísala al día siguiente.
`);

  const connectors = add('Conectores de contraste', writing.id, ['essay', 'conectores'], `# Conectores de contraste

## Dos alternativas

**On the other hand** introduce otro punto de vista. **In contrast** compara dos situaciones.

> **Regla:** no combines el inicio de una expresión con el final de la otra.

## Práctica breve

- [ ] Reescribir una frase con *on the other hand*.
- [ ] Leerla en voz alta y comprobar la preposición.
`);

  add('Lista de revisión del essay', writing.id, ['essay', 'revisión'], `# Lista de revisión del essay

## Antes de entregar

- [ ] Cada párrafo desarrolla una idea.
- [ ] Los conectores unen argumentos reales.
- [ ] La conclusión recoge la postura sin abrir un tema nuevo.

Si hay dudas de registro, repasa [los conectores de contraste](${notebookNoteHref(connectors)}#nb-dos-alternativas).
`);

  add('Listening: seguir la numeración', null, ['listening', 'tiempo'], `# Listening: seguir la numeración

## Durante el audio

Marca la pregunta activa antes de elegir respuesta. Si el hablante rectifica, espera al final de la idea.

## Después

Anota si el fallo fue de comprensión, de tiempo o de pasar la respuesta a otra casilla.
`);

  const errors = db.select({ id: errorRow.id, prompt: errorRow.prompt }).from(errorRow).all();
  const findError = (prompt: string): number => {
    const found = errors.find((error) => error.prompt === prompt);
    if (found === undefined) throw new Error(`Falta el error de demo: ${prompt}`);
    return found.id;
  };
  setErrorNoteLink(db, {
    errorId: findError('I only recognised him because of his voice. (WAS)'),
    noteId: cleft.id, headingSlug: cleftHeading.slug,
  }, at);
  setErrorNoteLink(db, {
    errorId: findError('Parrafo 2, conector de contraste'),
    noteId: connectors.id, headingSlug: null,
  }, at);
}
