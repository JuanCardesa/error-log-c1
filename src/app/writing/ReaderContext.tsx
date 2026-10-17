'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Estado que comparten la barra del lector y el texto: si el panel de anotaciones está
 * abierto y en qué modo está la hoja. Leer es lo normal; anotar y corregir la
 * transcripción se piden desde «Más acciones» y se cierran con su propia barra.
 */
export type ReaderMode = 'read' | 'annotate' | 'transcribe';

interface Reader {
  readonly panelOpen: boolean;
  readonly setPanelOpen: (open: boolean) => void;
  readonly mode: ReaderMode;
  readonly setMode: (mode: ReaderMode) => void;
}

const ReaderContext = createContext<Reader | null>(null);

export function ReaderProvider({ children }: { readonly children: ReactNode }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [mode, setMode] = useState<ReaderMode>('read');
  const value = useMemo(() => ({ panelOpen, setPanelOpen, mode, setMode }), [panelOpen, mode]);
  return <ReaderContext.Provider value={value}>{children}</ReaderContext.Provider>;
}

export function useReader(): Reader {
  const reader = useContext(ReaderContext);
  if (reader === null) throw new Error('useReader necesita un ReaderProvider');
  return reader;
}
