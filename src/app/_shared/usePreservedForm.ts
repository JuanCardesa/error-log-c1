'use client';

import { type FormEvent, useCallback, useRef } from 'react';

/**
 * Las acciones de React reinician los campos no controlados incluso cuando devuelven
 * un resultado de validacion con ok: false. Conservamos el borrador y dejamos que
 * cada formulario llame a resetForm solo despues de guardar correctamente.
 */
export function usePreservedForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const explicitReset = useRef(false);

  const onReset = useCallback((event: FormEvent<HTMLFormElement>) => {
    if (!explicitReset.current) event.preventDefault();
  }, []);

  const resetForm = useCallback((preserveValues: readonly string[] = []) => {
    const form = formRef.current;
    if (form === null) return;

    // El reset nativo tambien afecta a los selects controlados. Se restauran los
    // valores que la captura reutiliza entre errores, sin depender de otro render.
    const preserved = preserveValues.flatMap((name) => {
      const field = form.elements.namedItem(name);
      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement
      ) {
        return [{ field, value: field.value }];
      }
      return [];
    });

    explicitReset.current = true;
    try {
      form.reset();
      for (const { field, value } of preserved) field.value = value;
    } finally {
      explicitReset.current = false;
    }
  }, []);

  return { formRef, onReset, resetForm };
}
