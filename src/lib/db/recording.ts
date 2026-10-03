import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Category, Cause, Confidence } from '../domain/enums';
import { parseImportedBatch } from '../import/errors';
import { analyzeNotebookMarkdown } from '../notebook/markdown';
import { addDays, parseIsoDate, toIsoDate, toUtcIsoDate } from '../time/dates';
import { createDb, type Db } from './client';
import { migrate } from './migrate';
import { setErrorNoteLink } from './notebookLinkRepo';
import { createNotebookFolder, createNotebookNote } from './notebookRepo';
import { MIGRATIONS_DIR } from './paths';
import { errorRow, session, writingPiece } from './schema';

type Example = readonly [prompt: string, mine: string, correct: string, rule: string];

// Original teaching examples. No publisher exercises, fabricated Anki sync or exam scores.
const collocations: readonly Example[] = [
  ['The two teams finally ___ an agreement. (A reached / B made / C arrived / D earned)', 'arrived', 'reached', 'Reach an agreement: llegar a un acuerdo. Arrive necesita at y no encaja aquí.'],
  ['Her report ___ light on the housing shortage. (A shed / B put / C gave / D made)', 'gave', 'shed', 'Shed light on significa aclarar un asunto; se aprende como una unidad.'],
  ['We must ___ the deadline despite the delay. (A meet / B catch / C arrive / D hold)', 'catch', 'meet', 'Meet a deadline significa cumplir un plazo. Catch no forma esta colocación.'],
  ['The volunteers ___ research into local transport. (A made / B carried out / C held / D raised)', 'made', 'carried out', 'Con research usamos do, conduct o carry out. Make research no es una colocación natural.'],
  ['The new library will ___ a difference. (A do / B make / C set / D take)', 'do', 'make', 'Make a difference expresa tener un efecto; no se construye con do.'],
  ['The committee must ___ responsibility for the delay. (A take / B do / C set / D carry)', 'do', 'take', 'Take responsibility for significa asumir responsabilidad por algo.'],
  ['We need to ___ a balance between cost and quality. (A strike / B beat / C hit / D knock)', 'hit', 'strike', 'Strike a balance between expresa encontrar un equilibrio entre dos aspectos.'],
  ['The coordinator ___ a serious concern. (A raised / B lifted / C grew / D rose)', 'rose', 'raised', 'Raise a concern significa plantear una preocupación. Rise no lleva objeto directo.'],
];
const formation: readonly Example[] = [
  ['The new timetable offers greater ___. (FLEXIBLE)', 'flexability', 'flexibility', 'Flexible forma el sustantivo flexibility: conserva la i antes de -bility.'],
  ['Her explanation was clear and ___. (PERSUADE)', 'persuading', 'persuasive', 'Persuasive describe algo que convence; persuading es una forma verbal.'],
  ['The trial confirmed the ___ of the device. (RELY)', 'reliable', 'reliability', 'Reliability es el sustantivo para expresar fiabilidad; reliable es un adjetivo.'],
  ['The centre improved wheelchair ___. (ACCESSIBLE)', 'accessability', 'accessibility', 'Accessible forma accessibility, con i en la terminación -ibility.'],
  ['The project depends on continued ___. (COOPERATE)', 'cooperating', 'cooperation', 'Después de continued aquí se necesita el sustantivo cooperation.'],
  ['Their ___ led to several avoidable errors. (CARELESS)', 'carelessity', 'carelessness', 'Careless añade -ness para formar el sustantivo carelessness.'],
];
const transformations: readonly Example[] = [
  ['I regret ignoring her advice. WISH: I ___ her advice.', 'wish I listened to', 'wish I had listened to', 'Wish + past perfect expresa arrepentimiento sobre una acción pasada.'],
  ['Perhaps Lena missed the train. MAY: Lena ___ the train.', 'may miss', 'may have missed', 'May have + participio expresa una posibilidad sobre el pasado.'],
  ['The room was so noisy that I could not work. TOO: The room ___ work in.', 'was too noisy that I could', 'was too noisy for me to', 'Too + adjetivo + for + persona + to + infinitivo expresa este límite.'],
  ['I last saw Noor three months ago. FOR: I ___ three months.', 'did not see Noor for', 'have not seen Noor for', 'Present perfect negativo + for conecta el periodo pasado con el presente.'],
  ['You need not have brought any food. NECESSARY: It ___ any food, but you did.', 'was not necessary bringing', 'was not necessary to bring', 'Necessary se construye con to + infinitivo; el contexto confirma que la acción ocurrió.'],
];

export function recordingImport(today: Date) {
  return {
    session: { date: toIsoDate(today), kind: 'DRILL', paper: 'RUOE', part: 1,
      source: 'ONLINE', sourceRef: 'Urban gardens · collocations', itemsTotal: 8, itemsCorrect: 5, timed: false },
    errors: [
      { itemRef: '1', prompt: 'The students ___ research into urban gardens. (A made / B carried out / C held / D raised)',
        myAnswer: 'made', correctAnswer: 'carried out', category: 'COLOCACION', cause: 'CONFUSION', confidence: 'DUDABA',
        ruleNote: 'Con research usamos do, conduct o carry out. Make research no es una colocación natural.' },
      { itemRef: '4', prompt: 'After comparing the results, we ___ a conclusion. (A reached / B arrived / C came / D got)',
        myAnswer: 'arrived', correctAnswer: 'reached', category: 'COLOCACION', cause: 'CONFUSION', confidence: 'DUDABA',
        ruleNote: 'Reach a conclusion no lleva preposición. Arrive at y come to sí la necesitan.' },
      { itemRef: '7', prompt: 'The campaign aims to ___ awareness of food waste. (A rise / B raise / C lift / D grow)',
        myAnswer: 'rise', correctAnswer: 'raise', category: 'COLOCACION', cause: 'CONFUSION', confidence: 'DUDABA',
        ruleNote: 'Raise awareness significa concienciar. Raise lleva objeto; rise es intransitivo.' },
    ],
  };
}

function seedRecording(db: Db, today: Date) {
  const civil = parseIsoDate(toIsoDate(today));
  const monday = addDays(civil, -((civil.getUTCDay() + 6) % 7));
  const dateForWeek = (week: number) => week === 3 ? toIsoDate(today) : toUtcIsoDate(addDays(monday, (week - 3) * 7 + 2));
  const stamp = `${toIsoDate(today)}T12:00:00.000Z`;
  const colIds: number[] = [];
  const addSession = (week: number, part: number, total: number, examples: readonly Example[], category: Category, cause: Cause) => {
    const date = dateForWeek(week);
    const saved = db.insert(session).values({ date, kind: 'DRILL', paper: 'RUOE', part,
      source: 'ONLINE', sourceRef: `${part === 1 ? 'Collocations in context' : part === 3 ? 'Word formation lab' : 'Meaning preserved'} · semana ${week + 1}`,
      itemsTotal: total, itemsCorrect: total - examples.length, durationMin: part === 4 ? 12 : 10,
      timed: true, status: 'CLOSED' }).returning().get();
    examples.forEach(([prompt, myAnswer, correctAnswer, ruleNote], i) => {
      const confidence: Confidence = i === 0 && part === 1 ? 'SEGURO' : 'DUDABA';
      const inserted = db.insert(errorRow).values({ sessionId: saved.id, itemRef: String(i + 1), prompt,
        myAnswer, correctAnswer, category, cause, confidence, ruleNote, createdAt: `${date}T12:00:00.000Z` }).returning().get();
      if (part === 1) colIds.push(inserted.id);
    });
  };
  let c = 0; let f = 0; let t = 0;
  for (let week = 0; week < 4; week++) {
    const nc = [3, 2, 2, 1][week]!;
    const nf = [3, 2, 1, 0][week]!;
    addSession(week, 1, 8, collocations.slice(c, c + nc), 'COLOCACION', 'CONFUSION'); c += nc;
    addSession(week, 3, 8, formation.slice(f, f + nf), 'WORD_FORMATION', 'DESCONOCIMIENTO'); f += nf;
    if (week < 3) {
      const nt = [2, 2, 1][week]!;
      addSession(week, 4, 6, transformations.slice(t, t + nt), 'ESTRUCTURA', 'CONFUSION'); t += nt;
    }
  }
  let originalId: number | null = null;
  for (const rewrite of [false, true]) {
    const date = dateForWeek(rewrite ? 2 : 1);
    const saved = db.insert(session).values({ date, kind: 'WRITING', paper: 'WRITING', part: 1,
      source: 'ACADEMIA', sourceRef: `A greener campus · ${rewrite ? 'rewrite' : 'first draft'}`,
      timed: false, status: 'CLOSED' }).returning().get();
    const piece = db.insert(writingPiece).values({ sessionId: saved.id, date, genre: 'ESSAY',
      wordCount: rewrite ? 248 : 241, minutes: rewrite ? 36 : 43, corrector: 'YO', rewriteOf: originalId }).returning().get();
    originalId = piece.id;
    const writing: readonly Example[] = [
      ['Extract: The proposal depends of student support.', 'depends of', 'depends on', 'Depend se construye con on, también en un ensayo formal.'],
      ['Extract: The plan offers a economic solution.', 'a economic solution', 'an economic solution', 'Usa an ante un sonido vocálico: economic empieza con vocal.'],
      ['Extract: There are less cars near the campus.', 'less cars', 'fewer cars', 'Con nombres contables en plural, usa fewer en registro formal.'],
    ];
    writing.slice(0, rewrite ? 1 : 3).forEach(([prompt, myAnswer, correctAnswer, ruleNote], i) => {
      db.insert(errorRow).values({ sessionId: saved.id, itemRef: `P${i + 1}`, prompt, myAnswer, correctAnswer,
        category: i === 0 ? 'PREPOSICION_DEPENDIENTE' : 'ARTICULO_CUANTIFICADOR',
        cause: i === 1 ? 'DESPISTE' : 'CONFUSION', confidence: 'DUDABA', ruleNote, createdAt: `${date}T12:00:00.000Z` }).run();
    });
  }
  const vocab = createNotebookFolder(db, { name: 'Vocabulario', parentId: null }, stamp);
  const grammar = createNotebookFolder(db, { name: 'Gramática', parentId: null }, stamp);
  const writing = createNotebookFolder(db, { name: 'Writing', parentId: null }, stamp);
  const notes = [
    ['Collocations · research, conclusions, awareness', vocab.id, ['part1', 'collocations'],
      '## Research\n\n**Carry out research**: The students carried out research into urban gardens.\n\n> Make research no funciona: aprende el verbo junto al sustantivo.\n\n## Repaso de cinco minutos\n\nTapa los verbos en **carry out research**, **reach a conclusion** y **raise awareness**. Recupéralos de memoria y escribe una frase nueva con cada expresión.'],
    ['Word formation · endings that matter', vocab.id, ['part3'], '## Sustantivos\n\nFlexible → flexibility. Reliable → reliability. Careless → carelessness.\n\nBusca primero qué función necesita el hueco y comprueba después el sufijo.'],
    ['Past modals · possibility and regret', grammar.id, ['part4'], '## Posibilidad pasada\n\nLena **may have missed** the train. May have + participio expresa una posibilidad pasada.\n\n## Arrepentimiento\n\nI wish I had listened to her advice. Wish + past perfect mira hacia una decisión pasada.'],
    ['Dependent prepositions · depend on', grammar.id, ['prepositions', 'writing'], '## Depend on\n\nThe proposal **depends on** student support. Conserva la preposición al cambiar sujeto, tiempo o contexto.'],
    ['A greener campus · revision checklist', writing.id, ['essay'], '## Antes de reescribir\n\nLee la corrección del primer borrador. Comprueba **depend on**, **an economic solution** y **fewer cars**.\n\n## Después\n\nCompara los dos textos. Una revisión más fluida aún puede repetir una preposición incorrecta.'],
  ] as const;
  const savedNotes = notes.map(([title, folderId, tags, contentMarkdown], i) => createNotebookNote(db, {
    uid: `c1000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, title, folderId, tags: [...tags], contentMarkdown,
  }, stamp).note);
  const hero = savedNotes[0]!;
  const heading = analyzeNotebookMarkdown(hero.contentMarkdown).headings.find((h) => h.text === 'Research')!;
  setErrorNoteLink(db, { errorId: colIds[3]!, noteId: hero.id, headingSlug: heading.slug }, stamp);
  return { historicalErrorId: colIds[3]!, noteId: hero.id };
}

/** The only entry point creates a NEW file; never opens the personal DB or an override. */
export function prepareRecording(directory: string, today: Date) {
  mkdirSync(directory, { recursive: true });
  const runDirectory = mkdtempSync(join(directory, 'take-'));
  const file = join(runDirectory, 'recording.db');
  const db = createDb(file);
  let ids;
  try {
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
    ids = db.$client.transaction(() => seedRecording(db, today)).immediate();
  } finally { db.$client.close(); }
  const payload = recordingImport(today);
  parseImportedBatch(JSON.stringify(payload), toIsoDate(today));
  const importFile = join(directory, 'import.json');
  writeFileSync(importFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const state = { file, importFile, date: toIsoDate(today), ...ids };
  writeFileSync(join(runDirectory, 'state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  writeFileSync(join(directory, 'current.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return state;
}
