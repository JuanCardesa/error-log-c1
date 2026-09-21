/**
 * Bandeja de fallos.
 *
 * El coste de registrar un error no esta en copiarlo, esta en rellenar respuesta
 * correcta, categoria y regla, que son obligatorias en el error-log. Por eso el guion
 * no exporta ejercicio a ejercicio: va guardando los fallos de toda la sesion de estudio
 * y los entrega juntos, para revisarlos de una sentada.
 *
 * Reglas:
 * - Nada entra dos veces: cada fallo lleva su huella de actividad e intento.
 * - Lo que ya se copio, o lo que tire a la basura a proposito, no vuelve a entrar.
 * - La bandeja sobrevive a cambiar de ejercicio y a recargar.
 */

export const MAX_TRAY = 300;

/**
 * Completa una fila ya guardada con lo que se sepa despues.
 *
 * El fallo entra en la bandeja en cuanto se corrige, pero la solucion puede aparecer mas
 * tarde, al pulsar «mostrar respuestas». Sin esto, la fila se quedaria congelada sin ella.
 * Solo se rellenan huecos: nunca se pisa un dato que ya estuviera.
 */
function enrich(stored, incoming) {
  const merged = { ...stored };
  let changed = false;
  for (const field of ['correctAnswer', 'ruleNote']) {
    const had = String(stored[field] ?? '');
    const gets = String(incoming[field] ?? '');
    if (had === '' && gets !== '') {
      merged[field] = gets;
      changed = true;
    }
  }
  return { merged, changed };
}

/**
 * Anade los fallos que aun no estuvieran ni en la bandeja ni ya despachados, y completa
 * los que ya estaban si ahora se sabe algo mas de ellos.
 * @returns {{tray: Array, added: number, updated: number, full: boolean}}
 */
export function addToTray(tray, done, entries) {
  const next = [...tray];
  const position = new Map(next.map((entry, index) => [entry.mark, index]));
  let added = 0;
  let updated = 0;
  let full = false;

  for (const entry of entries) {
    const at = position.get(entry.mark);
    if (at !== undefined) {
      const { merged, changed } = enrich(next[at].row, entry.row);
      if (changed) {
        next[at] = { ...next[at], row: merged };
        updated += 1;
      }
      continue;
    }
    if (done.has(entry.mark)) continue;
    if (next.length >= MAX_TRAY) {
      full = true;
      break;
    }
    position.set(entry.mark, next.length);
    next.push(entry);
    added += 1;
  }
  return { tray: next, added, updated, full };
}

/**
 * Completa la solucion de los fallos guardados con lo que la plataforma confirma.
 *
 * Si fallo un hueco, reintento y esta vez lo acierto, Macmillan marca ese mismo hueco
 * como correcto con el valor bueno dentro. Eso no es una deduccion nuestra: es su
 * veredicto. Con el identificador del hueco reconocemos el fallo que ya teniamos
 * guardado y le ponemos la solucion.
 *
 * Nunca se pisa una solucion que ya estuviera, y si el valor confirmado coincide con mi
 * respuesta fallada se ignora: seria una contradiccion de la plataforma, no un dato.
 *
 * @param {Map<string, string>} confirmed huecos ahora correctos y su valor
 */
export function confirmAnswers(tray, activityKey, confirmed) {
  let updated = 0;
  const next = tray.map((entry) => {
    if (entry.activityKey !== activityKey) return entry;
    if (String(entry.row.correctAnswer ?? '') !== '') return entry;
    const value = confirmed.get(entry.gapId);
    if (value === undefined || value === '' || value === entry.row.myAnswer) return entry;
    updated += 1;
    return { ...entry, row: { ...entry.row, correctAnswer: value } };
  });
  return { tray: updated > 0 ? next : tray, updated };
}

/** Cuantos fallos hay y de cuantas actividades distintas. */
export function trayStats(tray) {
  return {
    count: tray.length,
    activities: new Set(tray.map((entry) => entry.activityKey)).size,
  };
}

/** Marca como despachadas las huellas dadas, sin duplicar. */
export function markDone(done, marks) {
  const next = new Set(done);
  for (const mark of marks) next.add(mark);
  return next;
}

/** Texto de la linea de la bandeja en el panel. */
export function describeTray(tray) {
  const { count, activities } = trayStats(tray);
  if (count === 0) return 'La bandeja esta vacia. Haz ejercicios y se iran guardando solos.';
  const fallos = count === 1 ? '1 fallo guardado' : `${String(count)} fallos guardados`;
  const de = activities === 1 ? '1 actividad' : `${String(activities)} actividades`;
  return `Bandeja: ${fallos} de ${de}.`;
}
