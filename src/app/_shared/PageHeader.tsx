import type { ReactNode, Ref } from 'react';

import { BackLink } from './BackLink';
import ui from './ui.module.css';

/**
 * Cabecera de página, la misma en todas las vistas. Los huecos van siempre en el mismo
 * sitio:
 *
 * - **Volver** arriba a la izquierda, con su flecha. Nombra adónde vuelve, así que hace de
 *   antetítulo: no hay otro.
 * - **Título** (serif) y, si hace falta, una **entradilla** en tinta secundaria.
 * - **Acciones** a la derecha, alineadas con el título: una primaria como mucho, o el
 *   selector de periodo.
 * - **Pestañas** debajo, a todo el ancho.
 *
 * `back.node` admite un enlace propio (p. ej. uno que recuerda la búsqueda de la lista);
 * si es un enlace, que sea un `BackLink`.
 */
export function PageHeader({ title, titleAside, lede, back, actions, tabs, titleId, titleRef }: {
  readonly title: ReactNode;
  /** Junto al título, en su misma línea: el estado de una sesión, por ejemplo. */
  readonly titleAside?: ReactNode;
  readonly lede?: ReactNode;
  readonly back?: { readonly href: string; readonly label: string } | { readonly node: ReactNode };
  readonly actions?: ReactNode;
  readonly tabs?: ReactNode;
  readonly titleId?: string;
  readonly titleRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <header className={ui.pageHeader}>
      {back !== undefined && (
        <div className={ui.pageBack}>
          {'node' in back ? back.node : <BackLink href={back.href} label={back.label} />}
        </div>
      )}
      <div className={ui.pageHead}>
        <div className={ui.pageHeadText}>
          <div className={ui.pageTitleRow}>
            <h1 id={titleId} ref={titleRef} tabIndex={titleRef === undefined ? undefined : -1} className={ui.pageTitle}>{title}</h1>
            {titleAside}
          </div>
          {lede !== undefined && <div className={ui.lede}>{lede}</div>}
        </div>
        {actions !== undefined && <div className={ui.pageActions}>{actions}</div>}
      </div>
      {tabs}
    </header>
  );
}
