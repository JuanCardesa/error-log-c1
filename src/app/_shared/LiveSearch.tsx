'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import ui from './ui.module.css';

/**
 * Búsqueda que filtra al escribir. El texto va a la URL (`q`) y la consulta la hace el
 * servidor; cambiar la búsqueda vuelve a la primera página y cierra el detalle abierto.
 */
export function LiveSearch({ placeholder, label, className }: {
  readonly placeholder: string;
  readonly label: string;
  readonly className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get('q') ?? '';
  const [value, setValue] = useState(current);

  useEffect(() => {
    if (value.trim() === current) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim() === '') next.delete('q');
      else next.set('q', value.trim());
      next.delete('p');
      next.delete('error');
      const query = next.toString();
      router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
    }, 250);
    return () => { clearTimeout(timer); };
  }, [value, current, params, pathname, router]);

  return (
    <input
      type="search"
      className={`${ui.input} ${className ?? ''}`}
      value={value}
      onChange={(event) => { setValue(event.target.value); }}
      placeholder={placeholder}
      aria-label={label}
    />
  );
}
