import Link from 'next/link';

import ui from './ui.module.css';

/**
 * Pestañas entre rutas o vistas con URL propia. Son enlaces con `aria-current`, no el
 * patrón tabs: navegan, no cambian un panel local.
 */
export function RouteTabs({ items, label }: {
  readonly items: readonly { readonly href: string; readonly label: string; readonly current: boolean }[];
  readonly label: string;
}) {
  return (
    <nav className={ui.tabs} aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={ui.tab}
          aria-current={item.current ? 'page' : undefined}
          scroll={false}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
