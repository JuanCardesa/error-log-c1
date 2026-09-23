import { describe, expect, it } from 'vitest';

import { RULE_SPECS } from '@/lib/rules';
import { CATEGORY_LABELS, RULE_SIGNAL_LABELS, categoryLabel } from './labels';

describe('etiquetas de interfaz', () => {
  it('nombra en palabras cada regla del motor', () => {
    // Una regla nueva sin etiqueta mostraria su señal tecnica en el Informe.
    for (const spec of RULE_SPECS) expect(RULE_SIGNAL_LABELS[spec.id], `regla ${String(spec.id)}`).toBeTruthy();
  });

  it('muestra una categoria conocida con su etiqueta', () => {
    expect(categoryLabel('PREPOSICION_DEPENDIENTE')).toBe(CATEGORY_LABELS.PREPOSICION_DEPENDIENTE);
  });

  it('dice que una categoria no se reconoce y cual llego', () => {
    expect(categoryLabel('PREPOSITION')).toBe('Categoría no reconocida (PREPOSITION)');
  });
});
