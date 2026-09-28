'use client';

import { useId, useRef, useState } from 'react';

import { CATEGORIES, type Category } from '@/lib/domain/enums';
import { CATEGORY_LABELS } from './labels';
import styles from './combobox.module.css';
import ui from './ui.module.css';

const isCategory = (value: string): value is Category => (CATEGORIES as readonly string[]).includes(value);

/**
 * Categoría con filtro al escribir. Cerrado enseña la categoría elegida; al enfocarlo se
 * despliega la lista entera y se filtra con lo que se teclea. ↑↓ mueven, Intro elige y
 * Escape cierra sin cerrar lo que haya detrás.
 */
export function CategoryCombobox({ id, value, onChange, pending = false, invalid = false, describedBy }: {
  readonly id?: string;
  readonly value: string;
  readonly onChange: (category: Category) => void;
  readonly pending?: boolean;
  readonly invalid?: boolean;
  readonly describedBy?: string;
}) {
  const generated = useId();
  const inputId = id ?? generated;
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const options = CATEGORIES.filter((category) => q === '' || CATEGORY_LABELS[category].toLowerCase().includes(q));
  const current = Math.min(active, Math.max(0, options.length - 1));
  const shown = open && options.length > 0;

  const pick = (category: Category) => {
    onChange(category);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className={styles.wrap}>
      <input
        ref={input}
        id={inputId}
        role="combobox"
        aria-expanded={shown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={shown ? `${listId}-${options[current] ?? ''}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        autoComplete="off"
        placeholder="Escribe para filtrar…"
        className={`${ui.input} ${pending ? ui.pending : ''}`}
        value={open ? query : isCategory(value) ? CATEGORY_LABELS[value] : ''}
        onFocus={() => {
          setOpen(true);
          setQuery('');
          setActive(Math.max(0, isCategory(value) ? CATEGORIES.indexOf(value) : 0));
        }}
        onBlur={() => { setOpen(false); }}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (!open) setOpen(true);
            else setActive(Math.min(options.length - 1, current + 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(Math.max(0, current - 1));
          } else if (event.key === 'Enter') {
            if (!shown) return;
            event.preventDefault();
            const option = options[current];
            if (option !== undefined) pick(option);
          } else if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
            setQuery('');
          }
        }}
      />
      <div id={listId} role="listbox" aria-label="Categorías" className={styles.list} hidden={!shown}>
        {shown && options.map((category, index) => (
          <div
            key={category}
            id={`${listId}-${category}`}
            role="option"
            aria-selected={index === current}
            className={`${styles.option} ${category === value ? styles.chosen : ''}`}
            onMouseDown={(event) => {
              // Antes del blur del campo: si no, la lista se cierra sin elegir.
              event.preventDefault();
              pick(category);
            }}
            onMouseEnter={() => { setActive(index); }}
          >
            {CATEGORY_LABELS[category]}
            {index === current && <span className={styles.hint} aria-hidden="true">↵</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
