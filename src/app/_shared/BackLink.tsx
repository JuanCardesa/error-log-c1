'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { MouseEvent } from 'react';

import { useT } from './i18nClient';
import ui from './ui.module.css';

/**
 * «← Sección»: a la vista solo el destino, que hace de antetítulo; quien no lo ve oye
 * «Volver a Sección», distinto del enlace de la navegación con el mismo nombre.
 *
 * `hint` va detrás, en tinta secundaria (p. ej. «· filtro conservado»), y forma parte del
 * nombre accesible.
 */
export function BackLink({ href, label, hint, onClick }: {
  readonly href: string;
  readonly label: string;
  readonly hint?: string;
  readonly onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const t = useT();
  const name = hint === undefined ? t.common.backTo(label) : `${t.common.backTo(label)} ${hint}`;
  return (
    <Link href={href} className={ui.backLink} aria-label={name} onClick={onClick}>
      <ArrowLeft size={16} aria-hidden="true" />
      {label}
      {hint !== undefined && <span className={ui.backHint}>{hint}</span>}
    </Link>
  );
}

