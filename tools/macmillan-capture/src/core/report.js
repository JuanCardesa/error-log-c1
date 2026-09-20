/**
 * Mensajes de estado.
 *
 * La distincion que importa: «no hay errores» es un exito y no genera entradas;
 * «no he podido leer el ejercicio» es un fallo de lectura y tampoco genera entradas,
 * pero se dice de otra manera para que no parezca lo mismo.
 */

const UNSUPPORTED = {
  tone: 'problem',
  title: 'No reconozco como marca la correccion este ejercicio',
  detail: 'Algo ha cambiado al corregir, pero no hay ninguna senal que diga que hueco esta bien y cual mal. Este formato todavia no esta soportado. Usa «Copiar muestra tecnica» y pasamela para escribir el adaptador.',
  canExport: false,
};

const MESSAGES = {
  idle: {
    tone: 'info',
    title: 'Esperando a que corrijas',
    detail: 'Haz el ejercicio y pulsa el boton de corregir de Macmillan. Este panel se activa solo.',
    canExport: false,
  },
  empty: {
    tone: 'problem',
    title: 'No veo preguntas en esta pantalla',
    detail: 'Abre el ejercicio y espera a que cargue del todo. Si ya esta abierto, este formato no esta soportado.',
    canExport: false,
  },
  uncorrected: {
    tone: 'info',
    title: 'El ejercicio no esta corregido',
    detail: 'No exporto nada todavia. Pulsa el boton de corregir de Macmillan y vuelve aqui.',
    canExport: false,
  },
  unsupported: UNSUPPORTED,
  unknownActivity: {
    tone: 'problem',
    title: 'Estoy en el ejercicio, pero no reconozco esta actividad',
    detail: 'Que veas esto ya significa que el guion corre aqui. Lo que no encaja es la estructura de esta actividad concreta, asi que no me invento nada. Pulsa «Copiar muestra tecnica» y pasamela: con eso se escribe el adaptador para este formato.',
    canExport: false,
  },
  conflict: {
    tone: 'problem',
    title: 'Dos senales de correccion se contradicen',
    detail: 'No me fio del resultado, asi que no exporto nada. Usa «Copiar muestra tecnica» y pasamela.',
    canExport: false,
  },
  partial: {
    tone: 'problem',
    title: 'El ejercicio esta a medio corregir',
    detail: 'Hay respuestas mias sin veredicto: o faltan preguntas por cargar o el formato no es el que creo. No exporto nada para no dejarme fallos fuera.',
    canExport: false,
  },
  unreadable: {
    tone: 'problem',
    title: 'Hay formatos que todavia no se leer',
    detail: 'Este ejercicio usa interacciones que aun no estan soportadas (arrastrar y soltar, emparejar sobre imagen). No exporto nada para no darte un resultado incompleto.',
    canExport: false,
  },
};

/**
 * @param {{phase: string, incorrect?: number, correct?: number, checked?: number, fresh?: number, skipped?: number}} state
 */
export function describe(state) {
  if (state.phase !== 'ready') return MESSAGES[state.phase] ?? UNSUPPORTED;

  const incorrect = state.incorrect ?? 0;
  const checked = state.checked ?? 0;
  if (incorrect === 0) {
    return {
      tone: 'good',
      title: 'Todo correcto: no hay errores que registrar',
      detail: `He comprobado ${String(checked)} ${checked === 1 ? 'respuesta' : 'respuestas'} y no has fallado ninguna. No genero ninguna entrada.`,
      canExport: false,
    };
  }

  const fresh = state.fresh ?? incorrect;
  if (fresh === 0) {
    return {
      tone: 'good',
      title: 'Los fallos de esta actividad ya estaban guardados',
      detail: `Los ${String(incorrect)} de este intento ya estan en la bandeja o ya los copiaste. No los repito.`,
      canExport: false,
    };
  }

  return {
    tone: 'good',
    title: `${String(fresh)} ${fresh === 1 ? 'fallo guardado' : 'fallos guardados'} de esta actividad`,
    detail: `De ${String(checked)} respuestas comprobadas. Sigue con los siguientes ejercicios y pulsa «Copiar todo» al acabar.`,
    canExport: true,
  };
}
