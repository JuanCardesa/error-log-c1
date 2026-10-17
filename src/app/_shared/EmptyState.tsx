import type { AriaRole, ReactNode } from 'react';

import ui from './ui.module.css';

/**
 * Lo que se ve cuando no hay nada que enseñar: por qué (`cause`), qué más conviene saber
 * (`detail`) y el siguiente paso (`action`, normalmente un enlace). `title` solo en un
 * primer uso, cuando el vacío es toda la sección.
 *
 * Va en el sitio de lo que falta y con su mismo filete; `inset` lo quita dentro de un
 * bloque que ya lo tiene.
 */
export function EmptyState({ title, titleId, cause, detail, action, inset = false, role }: {
  readonly title?: ReactNode;
  readonly titleId?: string;
  readonly cause: ReactNode;
  readonly detail?: ReactNode;
  readonly action?: ReactNode;
  readonly inset?: boolean;
  readonly role?: AriaRole;
}) {
  return (
    <div className={inset ? `${ui.empty} ${ui.emptyInset}` : ui.empty} role={role}>
      {title !== undefined && <h2 id={titleId} className={ui.sectionTitle}>{title}</h2>}
      <p className={ui.emptyCause}>{cause}</p>
      {detail !== undefined && <p className={ui.emptyDetail}>{detail}</p>}
      {action !== undefined && <div className={ui.emptyAction}>{action}</div>}
    </div>
  );
}
