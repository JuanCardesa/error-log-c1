/**
 * Ejercicios de prueba.
 *
 * Son INVENTADOS. Imitan patrones habituales de un ejercicio corregido, pero no son
 * HTML de Macmillan y no valen como prueba de compatibilidad con la plataforma. Sirven
 * para verificar el algoritmo: que solo salen los fallos, que mi respuesta sobrevive a
 * «mostrar respuestas» y que un formato desconocido se reconoce como tal.
 */

/**
 * @param {{marking?: 'class'|'aria'|'colour'|'attr', gaps?: Array, title?: string}} options
 */
export function exercisePage(options = {}) {
  const { marking = 'class', title = 'Unit 3 — Phrasal verbs' } = options;
  const questions = options.questions ?? [
    { ref: '1', before: 'They called ', after: ' the meeting.', answer: 'off' },
    { ref: '2', before: 'She takes ', after: ' her mother.', answer: 'after' },
    { ref: '3', before: 'He came ', after: ' with a good idea.', answer: 'up' },
  ];

  const items = questions.map((question) => {
    const gaps = question.gaps ?? [{ answer: question.answer }];
    let body = `<span class="num">${question.ref}</span> ${question.before ?? ''}`;
    gaps.forEach((gap, index) => {
      body += `<span class="gap"><input type="text" data-solution="${gap.answer}" aria-label="hueco ${String(index + 1)}"></span>`;
      body += gap.after ?? '';
    });
    body += question.after ?? '';
    return `<li class="question">${body}</li>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title></head>
<body>
<header><nav><a href="#">Contents</a><a href="#">Next unit</a></nav></header>
<main>
  <h2>${title}</h2>
  <p class="instructions">Complete the sentences with the correct particle.</p>
  <ol class="exercise">
${items}
  </ol>
  <button id="check" type="button">Check</button>
  <button id="show" type="button">Show answers</button>
  <button id="retry" type="button">Try again</button>
  <p id="score"></p>
</main>
<script>
  const marking = ${JSON.stringify(marking)};
  const gaps = () => [...document.querySelectorAll('.gap')];
  const inputOf = (gap) => gap.querySelector('input');
  const isRight = (input) => input.value.trim().toLowerCase() === input.dataset.solution.toLowerCase();

  document.getElementById('check').addEventListener('click', () => {
    let right = 0;
    for (const gap of gaps()) {
      const input = inputOf(gap);
      const ok = isRight(input);
      if (ok) right += 1;
      if (marking === 'class') gap.classList.add(ok ? 'correct' : 'incorrect');
      if (marking === 'colour') gap.classList.add(ok ? 'bg-green' : 'bg-red');
      if (marking === 'attr') gap.setAttribute('data-result', ok ? 'correct' : 'wrong');
      if (marking === 'aria') input.setAttribute('aria-invalid', ok ? 'false' : 'true');
    }
    document.getElementById('score').textContent = right + ' / ' + gaps().length;
  });

  // Sobrescribe el hueco con la solucion, que es el caso que no debe perder mi respuesta.
  document.getElementById('show').addEventListener('click', () => {
    for (const gap of gaps()) inputOf(gap).value = inputOf(gap).dataset.solution;
  });

  document.getElementById('retry').addEventListener('click', () => {
    for (const gap of gaps()) {
      gap.classList.remove('correct', 'incorrect', 'bg-green', 'bg-red');
      gap.removeAttribute('data-result');
      const input = inputOf(gap);
      input.removeAttribute('aria-invalid');
      input.value = '';
    }
    document.getElementById('score').textContent = '';
  });
</script>
</body></html>`;
}

/** Pregunta con dos huecos, para comprobar que se identifica cual he fallado. */
export const TWO_GAPS = [
  {
    ref: '7',
    before: 'She ',
    gaps: [{ answer: 'got', after: ' up early and ' }, { answer: 'set', after: ' out.' }],
  },
];
