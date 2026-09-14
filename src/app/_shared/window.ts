import { DEFAULT_WINDOW_DAYS, WINDOW_DAYS_OPTIONS, type WindowDays } from '@/lib/domain/thresholds';

/**
 * La ventana de analisis viaja en la URL (`?w=60`) para que un informe concreto se
 * pueda compartir o recargar sin perder el encuadre.
 */
export function parseWindow(value: string | string[] | undefined): WindowDays {
  if (typeof value !== 'string') return DEFAULT_WINDOW_DAYS;
  const parsed = Number(value);
  const match = WINDOW_DAYS_OPTIONS.find((option) => option === parsed);
  return match ?? DEFAULT_WINDOW_DAYS;
}

export type SearchParams = Record<string, string | string[] | undefined>;
