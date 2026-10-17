import { describe, expect, it } from 'vitest';

import { ANNOTATION_FOCUSES, CORRECTORS, GENRES } from '../domain/enums';
import { getMessages, LOCALES } from '../i18n';
import { parseWritingImport } from './contract';
import { WRITING_PROMPT_EXAMPLE, writingPrompt } from './prompt';

describe('writingPrompt', () => {
  it('su ejemplo cumple el contrato: no puede quedarse atrás', () => {
    const result = parseWritingImport(JSON.parse(WRITING_PROMPT_EXAMPLE), '2026-10-15', getMessages('en'));
    expect(result.ok).toBe(true);
  });

  it.each(LOCALES)('en %s lleva el ejemplo y los valores del contrato sin traducir', (locale) => {
    const prompt = writingPrompt(getMessages(locale));
    expect(prompt).toContain(WRITING_PROMPT_EXAMPLE);
    expect(prompt).toContain(GENRES.join(', '));
    expect(prompt).toContain(CORRECTORS.join(', '));
    expect(prompt).toContain(ANNOTATION_FOCUSES.join(', '));
    expect(prompt).toContain('"scope": "SPAN"');
    expect(prompt).toContain('300');
  });
});
