/**
 * Replica de la estructura del reproductor RCF de Macmillan.
 *
 * Las clases, los atributos y el anidamiento son los reales, tomados del DOM de una
 * actividad corregida del libro. El CONTENIDO es inventado a proposito: aqui no se
 * reproduce material del libro, solo el andamiaje tecnico que el adaptador tiene que
 * saber leer.
 */

const DEFAULT_ITEMS = [
  { ref: '1', lines: ['hold a', 'throw a'], id: 'CAPE_ID_3', answer: 'party', verdict: 'correct' },
  { ref: '2', lines: ['make a', 'take a'], id: 'CAPE_ID_6', answer: 'decision', verdict: 'correct' },
  // Fallado: puse «visit» donde iba «compliment».
  { ref: '3', lines: ['pay a', 'return a'], id: 'CAPE_ID_9', answer: 'visit', verdict: 'incorrect', solution: 'compliment' },
];

/** Lo que la actividad da por bueno en ese hueco. */
const solutionOf = (item) => item.solution ?? item.answer;

function gap(item, options) {
  const verdictClass = item.verdict === 'incorrect' ? 'incorrectAnswer' : 'correctAnswer';
  const aria = item.verdict === 'incorrect' ? 'true' : 'false';
  const markClass = item.verdict === 'incorrect' ? 'wrong' : 'correct';
  const label = item.verdict === 'incorrect' ? 'Incorrect' : 'Correct';

  // Sin corregir la plataforma no pone ni la clase de veredicto ni aria-invalid.
  const markable = options.marked
    ? `<span class="markable dev-markable-container ${options.conflict && item.verdict === 'incorrect' ? 'correctAnswer' : verdictClass}" aria-invalid="${aria}">`
    : '<span class="markable dev-markable-container">';

  const mark = options.marked
    ? `<span class="mark ${markClass}" aria-hidden="true" aria-label="${label}">&nbsp;<span class="dev-mark-label visually-hidden">${label.toLowerCase()}</span></span>`
    : '';

  // Hay actividades de arrastrar y actividades de escribir. El adaptador tiene que leer
  // mi respuesta en las dos: del texto del elemento o del valor del campo.
  const target = item.kind === 'input'
    ? `<input class="dev-droppable gapInput" type="text" value="${item.answer}" data-solution="${solutionOf(item)}" aria-label="gap ${item.ref}">`
    : `<span class="dev-droppable complexDroppable dragTarget movable ui-draggable ui-droppable populated" data-solution="${solutionOf(item)}" title="drag and drop gap ${item.ref}, ${item.answer}, ${label}" role="application" aria-label="drag and drop gap ${item.ref}, empty" tabindex="0" aria-roledescription="draggable">${item.answer}</span>`;

  return `<span data-rcfid="${item.id}" data-rcfinteraction="complexDroppable" class="complexDroppable clickAndStickable rcfDroppable">`
    + markable
    + target
    + mark
    + '</span></span>';
}

/**
 * @param {{marked?: boolean, items?: Array, conflict?: boolean, score?: string,
 *          activityId?: string, interactions?: string}} options
 */
export function rcfActivityPage(options = {}) {
  const {
    marked = true,
    items = DEFAULT_ITEMS,
    conflict = false,
    score = '',
    activityId = 'act0000000000000000000000000001',
    interactions = 'rcfDroppable',
    replaceOnCheck = false,
    // Una actividad del reproductor cuya raiz no encaja con el adaptador: pasa cuando
    // Macmillan usa una estructura que todavia no hemos visto.
    raizDesconocida = false,
  } = options;

  const list = items.map((item) => {
    const lines = (item.lines ?? []).map((line) => `${line}<br>`).join('');
    return `<li value="${item.ref}" id="collapsibleList_content-${activityId}-1-panel-${item.ref}">`
      + `<p>${lines}${gap(item, { marked, conflict })}<br></p></li>`;
  }).join('\n');

  const pool = [...new Set([...items.map((item) => item.answer), ...items.map(solutionOf)])]
    .map((word, index) => `<li data-complexid="complex_pool_${String(index)}" class="dragItem ui-draggable dev-droppable" role="application" aria-label="${word}" tabindex="0">${word}</li>`)
    .join('');

  const marks = marked ? 'marked marking showFeedback disabled' : '';
  const scoreCard = score === ''
    ? ''
    : `<div class="player__scoreCard--1dqo7" data-player-control="score-card"><div class="player__scoreCard_scoreText--1BB-m" data-player-control="score-card-text">${score}</div></div>`;

  const raiz = raizDesconocida
    ? '<div class="algo-que-no-conocemos">'
    : `<div class="dev-rcf-content activity mm_c06 ${marks} hasInteractive has_plyr"
     id="${activityId}" data-pseudoid="${activityId}" data-rcfxmlid="${activityId}"
     data-pointsavailable="${String(items.length)}" data-interactions="${interactions}"
     data-gradabletype="closed-gradable" data-isanswerkey="n" data-usingdragdrop="y">`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Reproductor</title></head>
<body>
${raiz}
  <form onsubmit="return false;">
    <div id="${activityId}_ariaLive" class="globalAriaLive visually-hidden" aria-live="assertive">ruido de accesibilidad que no debe salir</div>
    <div class="rubricContainer hasText"><div class="rubric clearfix"><div class="rubricBody lastChild">
      <p>Complete each pair of verbs with a noun from the box.</p>
    </div></div></div>
    <div class="backgroundArea"><div class="main clearfix lastChild">
      <section class="block mm_presentation presentation hasText">
        <div class="block referenceContentBlock"><div class="block mm_blockText clearfix lastChild">
          <p class="lastChild">He <b><i>held</i></b> a big <b><i>party</i></b> for his friends.</p>
        </div></div>
      </section>
      <section class="block mm_interactive interactive mm_c06 hasText">
        <div class="wordBox movable complexDroppable collapsibleWordBox" role="group" aria-labelledby="wordbox-heading">
          <h2 id="wordbox-heading" class="visually-hidden">Wordpool area. Press the Down Arrow to skip.</h2>
          <ul>${pool}</ul>
        </div>
        <ol class="numbered vertical collapsibleList_content" id="collapsibleList_content-${activityId}-1" aria-live="polite">
${list}
        </ol>
      </section>
    </div></div>
  </form>
</div>
${scoreCard}
<button id="mark" type="button">Check</button>
<button id="retry" type="button">Try again</button>
<script>
  const REPLACE_ON_CHECK = ${String(replaceOnCheck)};
  const valueOf = (target) => (target.tagName === 'INPUT' ? target.value : target.textContent).trim();
  const setValue = (target, value) => {
    if (target.tagName === 'INPUT') target.value = value;
    else target.textContent = value;
  };

  // Corrige como la plataforma: compara lo que hay en el hueco con su solucion.
  document.getElementById('mark').addEventListener('click', () => {
    const activity = document.querySelector('.activity');
    activity.classList.add('marked', 'marking', 'showFeedback', 'disabled');
    for (const holder of document.querySelectorAll('[data-rcfid]')) {
      const markable = holder.querySelector('.markable');
      const target = markable.querySelector('.dragTarget, .gapInput');
      const ok = valueOf(target) === target.dataset.solution;
      // Algunas actividades sustituyen mi respuesta por la solucion al corregir.
      if (!ok && REPLACE_ON_CHECK) setValue(target, target.dataset.solution);
      markable.classList.remove('correctAnswer', 'incorrectAnswer');
      markable.classList.add(ok ? 'correctAnswer' : 'incorrectAnswer');
      markable.setAttribute('aria-invalid', ok ? 'false' : 'true');
      const previous = markable.querySelector('.mark');
      if (previous) previous.remove();
      const mark = document.createElement('span');
      mark.className = 'mark ' + (ok ? 'correct' : 'wrong');
      mark.setAttribute('aria-hidden', 'true');
      mark.setAttribute('aria-label', ok ? 'Correct' : 'Incorrect');
      const hidden = document.createElement('span');
      hidden.className = 'dev-mark-label visually-hidden';
      hidden.textContent = ok ? 'correct' : 'incorrect';
      mark.append(hidden);
      markable.append(mark);
    }
  });

  // Imita lo que hace la plataforma: quitar el marcado al reintentar.
  document.getElementById('retry').addEventListener('click', () => {
    const activity = document.querySelector('.activity');
    activity.classList.remove('marked', 'marking', 'showFeedback', 'disabled');
    for (const markable of document.querySelectorAll('.markable')) {
      markable.classList.remove('correctAnswer', 'incorrectAnswer');
      markable.removeAttribute('aria-invalid');
      const mark = markable.querySelector('.mark');
      if (mark) mark.remove();
    }
  });
</script>
</body></html>`;
}

export { DEFAULT_ITEMS };
