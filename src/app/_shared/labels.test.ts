import { describe, expect, it } from 'vitest';

import { LOCALES, getMessages } from '@/lib/i18n';
import { RULE_SPECS } from '@/lib/rules';
import { categoryLabel, ruleSignalLabel } from './labels';

describe('etiquetas de interfaz', () => {
  it('nombra en palabras cada regla del motor, en cada idioma', () => {
    // Una regla nueva sin etiqueta mostraria su señal tecnica en el Informe.
    for (const locale of LOCALES) {
      for (const spec of RULE_SPECS) {
        expect(ruleSignalLabel(spec.id, getMessages(locale)), `regla ${String(spec.id)} (${locale})`).toBeTruthy();
      }
    }
  });

  it('muestra una categoria conocida con su etiqueta', () => {
    const t = getMessages('es');
    expect(categoryLabel('PREPOSICION_DEPENDIENTE', t)).toBe(t.labels.category.PREPOSICION_DEPENDIENTE);
    expect(categoryLabel('PREPOSICION_DEPENDIENTE', getMessages('en'))).toBe('Dependent preposition');
  });

  it('dice que una categoria no se reconoce y cual llego', () => {
    expect(categoryLabel('PREPOSITION', getMessages('es'))).toBe('Categoría no reconocida (PREPOSITION)');
    expect(categoryLabel('PREPOSITION', getMessages('en'))).toBe('Unrecognised category (PREPOSITION)');
  });
});
