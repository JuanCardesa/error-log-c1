/** Una tanda completa; cada hueco conserva su primer veredicto observado. */
export function emptyStudy() { return { date: null, activities: [] }; }

export function studyDate(now = new Date()) {
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function recordStudy(study, key, verdicts, context = {}, signature = '', date = studyDate()) {
  const previous = study.activities.find((entry) => entry.key === key);
  const items = new Map(previous?.items ?? []);
  for (const [id, verdict] of verdicts) {
    if (!items.has(id) && (verdict === 'correct' || verdict === 'incorrect')) items.set(id, verdict);
  }
  if (items.size === 0) return study;
  const entry = { key, items: [...items], signature, context: {
    book: context.book || previous?.context.book || '',
    pages: [...new Set([...(previous?.context.pages ?? []), ...(context.pages ?? [])])],
    activity: context.activity || previous?.context.activity || '',
  } };
  return { date: study.date ?? date, activities: [...study.activities.filter((value) => value.key !== key), entry] };
}

/** Solo se compactan números consecutivos que realmente constan. */
export function studyRanges(values) {
  const numbers = [...new Set(values.map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))].sort((a, b) => a - b);
  const ranges = [];
  for (let i = 0; i < numbers.length; i += 1) {
    const first = numbers[i];
    let last = first;
    while (numbers[i + 1] === last + 1) last = numbers[++i];
    ranges.push(first === last ? String(first) : `${String(first)}-${String(last)}`);
  }
  return ranges.join(', ');
}

export function studyReference(study) {
  const books = [...new Set(study.activities.map((entry) => entry.context.book))];
  return books.map((book) => {
    const contexts = study.activities.filter((entry) => entry.context.book === book).map((entry) => entry.context);
    const pages = studyRanges(contexts.flatMap((context) => context.pages));
    const activities = studyRanges(contexts.map((context) => context.activity));
    return [book, pages && `págs. ${pages}`, activities && `actividades ${activities}`].filter(Boolean).join(' · ');
  }).filter(Boolean).join(' / ') || null;
}

export function studySession(study) {
  const verdicts = study.activities.flatMap((entry) => entry.items.map(([, verdict]) => verdict));
  return {
    date: study.date ?? studyDate(), kind: 'DRILL', paper: null, part: null, source: 'LIBRO',
    sourceRef: studyReference(study), itemsTotal: verdicts.length,
    itemsCorrect: verdicts.filter((value) => value === 'correct').length, timed: false,
  };
}
