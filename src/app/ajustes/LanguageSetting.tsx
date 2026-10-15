'use client';

import { useId, useOptimistic, useRef, useState, useTransition, type KeyboardEvent } from 'react';

import { LOCALES, type Locale } from '@/lib/i18n';
import { useLocale, useT } from '../_shared/i18nClient';
import ui from '../_shared/ui.module.css';
import { setLocaleAction } from './actions';
import styles from './ajustes.module.css';

/**
 * Idioma de la interfaz: grupo de opciones con el conmutador segmentado de siempre. La
 * elección se marca al momento y el resto de la app cambia cuando responde el servidor.
 * Flechas para moverse entre opciones, como en cualquier grupo de radio.
 */
export function LanguageSetting() {
  const t = useT();
  const locale = useLocale();
  const [shown, setShown] = useOptimistic(locale);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const labelId = useId();
  const helpId = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const choose = (next: Locale) => {
    if (next === shown) return;
    setFailed(false);
    startTransition(async () => {
      setShown(next);
      try {
        const result = await setLocaleAction(next);
        if (!result.ok) setFailed(true);
      } catch {
        setFailed(true);
      }
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const nextIndex = (index + step + LOCALES.length) % LOCALES.length;
    const next = LOCALES[nextIndex];
    if (next === undefined) return;
    buttons.current[nextIndex]?.focus();
    choose(next);
  };

  return (
    <section className={styles.section} aria-labelledby={labelId}>
      <h2 id={labelId} className={ui.sectionTitle}>{t.settings.language}</h2>
      <p id={helpId} className={ui.help}>{t.settings.languageHelp}</p>
      <div role="radiogroup" aria-labelledby={labelId} aria-describedby={helpId} aria-busy={pending} className={ui.segmented}>
        {LOCALES.map((value, index) => (
          <button
            key={value}
            ref={(element) => { buttons.current[index] = element; }}
            type="button"
            role="radio"
            lang={value}
            aria-checked={value === shown}
            tabIndex={value === shown ? 0 : -1}
            className={ui.segment}
            onClick={() => { choose(value); }}
            onKeyDown={(event) => { onKeyDown(event, index); }}
          >
            {t.settings.languages[value]}
          </button>
        ))}
      </div>
      {failed && <p role="alert" className={ui.fieldError}>{t.settings.saveFailed}</p>}
    </section>
  );
}
