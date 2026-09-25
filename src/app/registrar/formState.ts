/**
 * Estado compartido entre los formularios y sus acciones.
 *
 * Vive aqui y no en `actions.ts` porque un modulo marcado con `'use server'` solo puede
 * exportar funciones asincronas: cualquier constante o tipo que se exporte desde alli
 * no llega al cliente.
 */
export interface FormState {
  readonly ok: boolean;
  /** Mensajes por campo, para pintarlos junto a su input. */
  readonly fieldErrors: Readonly<Record<string, string[]>>;
  readonly message: string | null;
  /** Id de lo que se acaba de crear, para que la UI reaccione sin recargar estado. */
  readonly createdId?: number;
}

export const EMPTY_STATE: FormState = { ok: false, fieldErrors: {}, message: null };

/** Resultado de una acción sin formulario: se muestra en un aviso, nunca se da por hecho. */
export interface ActionResult {
  readonly ok: boolean;
  readonly message: string;
}
