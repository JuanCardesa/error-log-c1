import type {
  Category,
  Cause,
  Confidence,
  Paper,
  SessionKind,
  Source,
} from '../domain/enums';
import { addDays, toIsoDate } from '../time/dates';
import type { Db } from './client';
import { errorRow, session, writingPiece } from './schema';

/**
 * Datos de ejemplo realistas. Las fechas se generan relativas a `today` para que el
 * conjunto caiga siempre dentro de la ventana de 30 dias y el informe tenga algo que
 * decir nada mas clonar el repo.
 *
 * Incluye a proposito:
 *  - una sesion con **cero errores** (es el denominador: sin ella las tasas mienten al alza),
 *  - una sesion de Writing sin items contabilizados,
 *  - un texto original y su reescritura, con un error que reaparece.
 */

interface SeedError {
  readonly itemRef: string | null;
  readonly prompt: string;
  readonly myAnswer: string | null;
  readonly correctAnswer: string;
  readonly cause: Cause;
  readonly category: Category;
  readonly subcategory?: string | null;
  readonly confidence: Confidence;
  readonly lateInSession?: boolean;
  readonly ruleNote: string;
  readonly ankiAdded?: boolean;
  readonly secs?: number;
}

interface SeedSession {
  readonly daysAgo: number;
  readonly kind: SessionKind;
  readonly paper: Paper;
  readonly part: number;
  readonly source: Source;
  readonly sourceRef: string | null;
  readonly itemsTotal: number | null;
  readonly itemsCorrect: number | null;
  readonly durationMin: number;
  readonly timed: boolean;
  readonly errors: readonly SeedError[];
}

const SESSIONS: readonly SeedSession[] = [
  {
    daysAgo: 2,
    kind: 'DRILL',
    paper: 'RUOE',
    part: 4,
    source: 'LIBRO',
    sourceRef: 'Unidad 1, ej. 5',
    itemsTotal: 6,
    itemsCorrect: 3,
    durationMin: 20,
    timed: false,
    errors: [
      {
        itemRef: '2',
        prompt: 'I only recognised him because of his voice. (WAS)',
        myAnswer: 'it was only his voice that I recognised him',
        correctAnswer: 'it was only by his voice that I recognised him',
        cause: 'FORMATO',
        category: 'ESTRUCTURA',
        subcategory: 'cleft',
        confidence: 'DUDABA',
        ruleNote:
          'En las cleft con "it was... that" la preposicion del complemento no desaparece',
        secs: 35,
      },
      {
        itemRef: '4',
        prompt: 'They had to call off the meeting. (CALLED)',
        myAnswer: 'the meeting had to be called of',
        correctAnswer: 'the meeting had to be called off',
        cause: 'ORTOGRAFIA',
        category: 'SPELLING',
        confidence: 'SEGURO',
        ruleNote: 'call off lleva doble f, "of" es la preposicion distinta',
        ankiAdded: true,
        secs: 18,
      },
      {
        itemRef: '5',
        prompt: 'She regretted not taking the job. (WISHED)',
        myAnswer: 'she wished she did not refuse',
        correctAnswer: 'she wished she had taken',
        cause: 'DESCONOCIMIENTO',
        category: 'TIEMPO_VERBAL',
        confidence: 'DUDABA',
        ruleNote: 'wish + past perfect para arrepentirse de algo ya pasado',
        secs: 40,
      },
    ],
  },
  {
    daysAgo: 3,
    kind: 'DRILL',
    paper: 'RUOE',
    part: 3,
    source: 'WORKBOOK',
    sourceRef: 'Unit 2, word formation',
    itemsTotal: 8,
    itemsCorrect: 5,
    durationMin: 15,
    timed: true,
    errors: [
      {
        itemRef: '3',
        prompt: 'His ______ to the project was total. (COMMIT)',
        myAnswer: 'commitement',
        correctAnswer: 'commitment',
        cause: 'ORTOGRAFIA',
        category: 'SPELLING',
        subcategory: '-ment',
        confidence: 'SEGURO',
        ruleNote: 'commit pierde la e al añadir -ment, y no dobla la t',
        ankiAdded: true,
        secs: 22,
      },
      {
        itemRef: '6',
        prompt: 'The results were ______ disappointing. (UTTER)',
        myAnswer: 'utterly',
        correctAnswer: 'utterly',
        cause: 'DESPISTE',
        category: 'WORD_FORMATION',
        confidence: 'SEGURO',
        lateInSession: true,
        ruleNote: 'La escribi bien y la copie mal en la hoja: comprobar antes de entregar',
        secs: 15,
      },
      {
        itemRef: '8',
        prompt: 'There was widespread ______ with the decision. (SATISFY)',
        myAnswer: 'unsatisfaction',
        correctAnswer: 'dissatisfaction',
        cause: 'DESCONOCIMIENTO',
        category: 'WORD_FORMATION',
        subcategory: 'prefijos negativos',
        confidence: 'DUDABA',
        lateInSession: true,
        ruleNote: 'satisfaction lleva el prefijo dis-, no un-, para el sentido negativo',
        secs: 30,
      },
    ],
  },
  {
    daysAgo: 5,
    kind: 'DRILL',
    paper: 'LISTENING',
    part: 2,
    source: 'WORKBOOK',
    sourceRef: 'Test 3',
    itemsTotal: 8,
    itemsCorrect: 5,
    durationMin: 15,
    timed: true,
    errors: [
      {
        itemRef: '11',
        prompt: 'The speaker says the survey was carried out by ______',
        myAnswer: 'volunters',
        correctAnswer: 'volunteers',
        cause: 'ORTOGRAFIA',
        category: 'SPELLING',
        confidence: 'SEGURO',
        lateInSession: true,
        ruleNote: 'volunteer lleva doble e antes de la r. En Part 2 mal escrito es cero',
        ankiAdded: true,
        secs: 20,
      },
      {
        itemRef: '13',
        prompt: 'She mentions the need for better ______ between departments',
        myAnswer: 'comunication',
        correctAnswer: 'communication',
        cause: 'ORTOGRAFIA',
        category: 'SPELLING',
        confidence: 'DUDABA',
        ruleNote: 'communication lleva doble m, como community',
        secs: 25,
      },
      {
        itemRef: '15',
        prompt: 'The project was delayed by ______ weather',
        myAnswer: null,
        correctAnswer: 'adverse',
        cause: 'TIEMPO',
        category: 'LEXICO',
        confidence: 'ADIVINE',
        lateInSession: true,
        ruleNote: 'Me quede sin tiempo en el segundo audio: repartir mejor los 30 segundos',
        secs: 12,
      },
    ],
  },
  {
    daysAgo: 7,
    kind: 'PARCIAL',
    paper: 'RUOE',
    part: 1,
    source: 'TRAINER',
    sourceRef: 'Trainer 2, test 1',
    itemsTotal: 8,
    itemsCorrect: 7,
    durationMin: 12,
    timed: true,
    errors: [
      {
        itemRef: '5',
        prompt: 'The company has ______ a significant loss this quarter',
        myAnswer: 'suffered',
        correctAnswer: 'sustained',
        cause: 'CONFUSION',
        category: 'COLOCACION',
        subcategory: 'sustain/suffer',
        confidence: 'SEGURO',
        ruleNote: 'sustain a loss es la colocacion formal; suffer es mas general y coloquial',
        ankiAdded: true,
        secs: 28,
      },
    ],
  },
  {
    // La sesion perfecta. Cuenta en el denominador aunque no aporte ni un error.
    daysAgo: 9,
    kind: 'DRILL',
    paper: 'RUOE',
    part: 2,
    source: 'LIBRO',
    sourceRef: 'Unidad 2, ej. 1',
    itemsTotal: 8,
    itemsCorrect: 8,
    durationMin: 10,
    timed: false,
    errors: [],
  },
  {
    daysAgo: 11,
    kind: 'SIMULACRO',
    paper: 'RUOE',
    part: 4,
    source: 'PAST_PAPER',
    sourceRef: 'Dic 2024',
    itemsTotal: 6,
    itemsCorrect: 2,
    durationMin: 15,
    timed: true,
    errors: [
      {
        itemRef: '1',
        prompt: 'It is ages since I last saw her. (NOT)',
        myAnswer: 'I have not saw her for ages',
        correctAnswer: 'I have not seen her for ages',
        cause: 'DESPISTE',
        category: 'TIEMPO_VERBAL',
        confidence: 'SEGURO',
        ruleNote: 'Present perfect pide participio: seen, no saw. Releer antes de pasar',
        secs: 20,
      },
      {
        itemRef: '3',
        prompt: 'Nobody expected him to win. (CONTRARY)',
        myAnswer: 'contrary of all expectations',
        correctAnswer: 'contrary to all expectations',
        cause: 'DESCONOCIMIENTO',
        category: 'PREPOSICION_DEPENDIENTE',
        subcategory: 'contrary to',
        confidence: 'DUDABA',
        ruleNote: 'contrary va siempre con to, nunca con of',
        ankiAdded: true,
        secs: 33,
      },
      {
        itemRef: '5',
        prompt: 'He only passed because he worked hard. (HAD)',
        myAnswer: 'had he not worked hard he would not pass',
        correctAnswer: 'had he not worked hard he would not have passed',
        cause: 'DESPISTE',
        category: 'ESTRUCTURA',
        subcategory: 'condicional tercero',
        confidence: 'DUDABA',
        lateInSession: true,
        ruleNote: 'El tercer condicional pide would have + participio en la principal',
        secs: 45,
      },
      {
        itemRef: '6',
        prompt: 'They said the decision was final. (MADE)',
        myAnswer: null,
        correctAnswer: 'it was made clear that the decision',
        cause: 'TIEMPO',
        category: 'ESTRUCTURA',
        confidence: 'ADIVINE',
        lateInSession: true,
        ruleNote: 'La deje en blanco por reloj: en Part 4 dar siempre una respuesta',
        secs: 10,
      },
    ],
  },
  {
    daysAgo: 19,
    kind: 'WRITING',
    paper: 'WRITING',
    part: 1,
    source: 'ACADEMIA',
    sourceRef: 'Essay: urban transport',
    itemsTotal: null,
    itemsCorrect: null,
    durationMin: 45,
    timed: true,
    errors: [
      {
        itemRef: null,
        prompt: 'Parrafo 2, conector de contraste',
        myAnswer: 'In the other hand',
        correctAnswer: 'on the other hand',
        cause: 'CONFUSION',
        category: 'DISCURSO',
        subcategory: 'conectores de contraste',
        confidence: 'SEGURO',
        ruleNote: 'on the other hand, no in. Se confunde con "in contrast"',
        ankiAdded: true,
        secs: 30,
      },
      {
        itemRef: null,
        prompt: 'Parrafo 3, registro',
        myAnswer: 'a lot of people think',
        correctAnswer: 'many people argue',
        cause: 'DESCONOCIMIENTO',
        category: 'REGISTRO',
        subcategory: 'registro academico',
        confidence: 'DUDABA',
        ruleNote: 'En el essay se evita "a lot of": many, numerous, a great deal of',
        secs: 40,
      },
      {
        itemRef: null,
        prompt: 'Conclusion, estructura del texto',
        myAnswer: 'To sum up I think that',
        correctAnswer: 'In conclusion, the evidence suggests that',
        cause: 'FORMATO',
        category: 'ESTRUCTURA_TEXTO',
        confidence: 'DUDABA',
        ruleNote: 'La conclusion del essay recoge el argumento, no abre una opinion nueva',
        secs: 35,
      },
    ],
  },
  {
    daysAgo: 14,
    kind: 'DRILL',
    paper: 'RUOE',
    part: 3,
    source: 'ONLINE',
    sourceRef: 'Flo-Joe word formation',
    itemsTotal: 8,
    itemsCorrect: 6,
    durationMin: 12,
    timed: false,
    errors: [
      {
        itemRef: '2',
        prompt: 'The evidence was ______ conclusive. (HARD)',
        myAnswer: 'hardly',
        correctAnswer: 'hardly',
        cause: 'DESPISTE',
        category: 'WORD_FORMATION',
        confidence: 'SEGURO',
        ruleNote: 'Acerte la palabra y la puse en el hueco equivocado: comprobar el numero',
        secs: 15,
      },
      {
        itemRef: '7',
        prompt: 'They showed complete ______ for the rules. (REGARD)',
        myAnswer: 'unregard',
        correctAnswer: 'disregard',
        cause: 'DESCONOCIMIENTO',
        category: 'WORD_FORMATION',
        subcategory: 'prefijos negativos',
        confidence: 'ADIVINE',
        ruleNote: 'disregard es el sustantivo, unregard no existe en ingles',
        secs: 25,
      },
    ],
  },
  {
    daysAgo: 16,
    kind: 'CLASE',
    paper: 'SPEAKING',
    part: 2,
    source: 'ACADEMIA',
    sourceRef: 'Long turn, fotos de trabajo',
    itemsTotal: 4,
    itemsCorrect: 3,
    durationMin: 20,
    timed: false,
    errors: [
      {
        itemRef: null,
        prompt: 'Comparar dos fotografias durante un minuto',
        myAnswer: 'both photos are showing people that works',
        correctAnswer: 'both photos show people at work',
        cause: 'DESPISTE',
        category: 'TIEMPO_VERBAL',
        confidence: 'SEGURO',
        ruleNote: 'Con verbos de estado se usa presente simple, no continuo, al describir',
        secs: 30,
      },
    ],
  },
  {
    // Reescritura del essay de hace 19 dias. Repite uno de sus errores.
    daysAgo: 12,
    kind: 'WRITING',
    paper: 'WRITING',
    part: 1,
    source: 'ACADEMIA',
    sourceRef: 'Essay: urban transport (rewrite)',
    itemsTotal: null,
    itemsCorrect: null,
    durationMin: 40,
    timed: true,
    errors: [
      {
        itemRef: null,
        prompt: 'Parrafo 2, conector de contraste',
        myAnswer: 'In the other hand',
        correctAnswer: 'on the other hand',
        cause: 'CONFUSION',
        category: 'DISCURSO',
        subcategory: 'conectores de contraste',
        confidence: 'SEGURO',
        ruleNote: 'Repetido del original: on the other hand. No lei la correccion',
        secs: 25,
      },
      {
        itemRef: null,
        prompt: 'Parrafo 1, colocacion',
        myAnswer: 'make a solution',
        correctAnswer: 'find a solution',
        cause: 'CONFUSION',
        category: 'COLOCACION',
        subcategory: 'make/find',
        confidence: 'DUDABA',
        ruleNote: 'find o reach a solution; make no coloca con solution',
        secs: 28,
      },
    ],
  },
  {
    daysAgo: 22,
    kind: 'DRILL',
    paper: 'LISTENING',
    part: 4,
    source: 'TRAINER',
    sourceRef: 'Trainer 1, test 4',
    itemsTotal: 6,
    itemsCorrect: 4,
    durationMin: 10,
    timed: true,
    errors: [
      {
        itemRef: '26',
        prompt: 'Que opina el hablante sobre su primer trabajo',
        myAnswer: 'B',
        correctAnswer: 'C',
        cause: 'DESPISTE',
        category: 'COMPRENSION',
        confidence: 'DUDABA',
        ruleNote: 'Me quede con la primera pista y el hablante se corrige despues',
        secs: 20,
      },
      {
        itemRef: '29',
        prompt: 'Por que cambio de sector',
        myAnswer: 'A',
        correctAnswer: 'E',
        cause: 'DESPISTE',
        category: 'COMPRENSION',
        confidence: 'SEGURO',
        lateInSession: true,
        ruleNote: 'Marque la opcion de la pregunta anterior: seguir la numeracion con el dedo',
        secs: 18,
      },
    ],
  },
  {
    daysAgo: 26,
    kind: 'DRILL',
    paper: 'RUOE',
    part: 6,
    source: 'LIBRO',
    sourceRef: 'Unidad 3, cross-text',
    itemsTotal: 8,
    itemsCorrect: 5,
    durationMin: 18,
    timed: false,
    errors: [
      {
        itemRef: '37',
        prompt: 'Que critico comparte la opinion de A sobre la financiacion',
        myAnswer: 'B',
        correctAnswer: 'D',
        cause: 'DESPISTE',
        category: 'COMPRENSION',
        confidence: 'DUDABA',
        ruleNote: 'En Part 6 hay que localizar la opinion concreta, no el tema general',
        secs: 50,
      },
      {
        itemRef: '38',
        prompt: 'Expresion de acuerdo parcial entre textos',
        myAnswer: 'to some degree',
        correctAnswer: 'up to a point',
        cause: 'DESCONOCIMIENTO',
        category: 'EXPRESION_FIJA',
        confidence: 'DUDABA',
        ruleNote: 'up to a point es la formula fija de acuerdo parcial en registro formal',
        secs: 32,
      },
      {
        itemRef: '40',
        prompt: 'Conector de concesion en el ultimo parrafo',
        myAnswer: 'even though of',
        correctAnswer: 'despite',
        cause: 'CONFUSION',
        category: 'DISCURSO',
        subcategory: 'despite/even though',
        confidence: 'SEGURO',
        ruleNote: 'despite + sustantivo, even though + oracion. No se mezclan',
        secs: 38,
      },
    ],
  },
];

export interface SeedResult {
  readonly sessions: number;
  readonly errors: number;
  readonly pieces: number;
}

export function seed(db: Db, today: Date): SeedResult {
  const isoDate = (daysAgo: number): string => toIsoDate(addDays(today, -daysAgo));
  const stamp = (daysAgo: number): string =>
    `${isoDate(daysAgo)}T19:00:00.000Z`;

  let errorCount = 0;
  const writingSessionIds: { daysAgo: number; sessionId: number }[] = [];

  for (const seedSession of SESSIONS) {
    const [inserted] = db
      .insert(session)
      .values({
        date: isoDate(seedSession.daysAgo),
        kind: seedSession.kind,
        paper: seedSession.paper,
        part: seedSession.part,
        source: seedSession.source,
        sourceRef: seedSession.sourceRef,
        itemsTotal: seedSession.itemsTotal,
        itemsCorrect: seedSession.itemsCorrect,
        durationMin: seedSession.durationMin,
        timed: seedSession.timed,
        status: 'CLOSED',
      })
      .returning({ id: session.id })
      .all();

    if (inserted === undefined) throw new Error('No se pudo insertar la sesion');
    const sessionId = inserted.id;

    if (seedSession.paper === 'WRITING') {
      writingSessionIds.push({ daysAgo: seedSession.daysAgo, sessionId });
    }

    for (const error of seedSession.errors) {
      const added = error.ankiAdded === true;
      db.insert(errorRow)
        .values({
          sessionId,
          itemRef: error.itemRef,
          prompt: error.prompt,
          myAnswer: error.myAnswer,
          correctAnswer: error.correctAnswer,
          cause: error.cause,
          category: error.category,
          subcategory: error.subcategory ?? null,
          confidence: error.confidence,
          lateInSession: error.lateInSession ?? false,
          ruleNote: error.ruleNote,
          ankiAdded: added,
          ankiAddedAt: added ? stamp(seedSession.daysAgo) : null,
          secs: error.secs ?? null,
          createdAt: stamp(seedSession.daysAgo),
        })
        .run();
      errorCount += 1;
    }
  }

  // El texto mas antiguo es el original; el mas reciente, su reescritura.
  const ordered = [...writingSessionIds].sort((a, b) => b.daysAgo - a.daysAgo);
  const original = ordered[0];
  const rewrite = ordered[1];

  let pieces = 0;
  if (original !== undefined) {
    const [originalPiece] = db
      .insert(writingPiece)
      .values({
        sessionId: original.sessionId,
        date: isoDate(original.daysAgo),
        genre: 'ESSAY',
        wordCount: 236,
        minutes: 45,
        timed: true,
        rewriteOf: null,
        corrector: 'PROFESOR',
        bandContent: 3,
        bandCommunicative: 3,
        bandOrganisation: 2,
        bandLanguage: 2,
      })
      .returning({ id: writingPiece.id })
      .all();
    pieces += 1;

    if (rewrite !== undefined && originalPiece !== undefined) {
      db.insert(writingPiece)
        .values({
          sessionId: rewrite.sessionId,
          date: isoDate(rewrite.daysAgo),
          genre: 'ESSAY',
          wordCount: 248,
          minutes: 40,
          timed: true,
          rewriteOf: originalPiece.id,
          corrector: 'PROFESOR',
          bandContent: 4,
          bandCommunicative: 3,
          bandOrganisation: 3,
          bandLanguage: 3,
        })
        .run();
      pieces += 1;
    }
  }

  return { sessions: SESSIONS.length, errors: errorCount, pieces };
}
