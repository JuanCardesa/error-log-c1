'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

import shared from '../_shared/report.module.css';

/**
 * Aviso de las acciones de conversion, fuera de los componentes que las disparan.
 *
 * Convertir un error lo saca de la cola, y `revalidatePath` vuelve a pintar la lista: el
 * `QueueItem` que guardaba el mensaje se desmontaba con el dentro, asi que la confirmacion
 * no llegaba a verse nunca. El aviso vive aqui, por encima de lo que cambia, y aguanta.
 */
export interface ConversionResult {
  readonly ok: boolean;
  readonly message: string;
}

const FeedbackContext = createContext<{
  result: ConversionResult | null;
  report: (result: ConversionResult) => void;
}>({ result: null, report: () => undefined });

export function ConversionFeedback({ children }: { readonly children: ReactNode }) {
  const [result, setResult] = useState<ConversionResult | null>(null);
  return (
    <FeedbackContext.Provider value={{ result, report: setResult }}>
      {children}
    </FeedbackContext.Provider>
  );
}

export function useConversionFeedback(): (result: ConversionResult) => void {
  return useContext(FeedbackContext).report;
}

/** Se coloca donde se quiera leer, no donde se dispara. */
export function ConversionNotice() {
  const { result } = useContext(FeedbackContext);
  if (result === null) return null;
  return (
    <p role={result.ok ? 'status' : 'alert'} className={result.ok ? shared.note : shared.empty}>
      {result.message}
    </p>
  );
}
