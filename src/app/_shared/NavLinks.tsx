'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import styles from '../layout.module.css';

interface NavItem {
  readonly href: string;
  readonly label: string;
}

/**
 * Enlaces de la barra, con la pagina actual marcada. Es cliente solo por `usePathname`:
 * sin marca, nada decia donde estabas ni a la vista ni al lector de pantalla.
 */
export function NavLinks({ main, more }: {
  readonly main: readonly NavItem[];
  readonly more: readonly NavItem[];
}) {
  const pathname = usePathname();
  const current = (href: string): boolean => pathname === href || pathname.startsWith(`${href}/`);

  const link = (item: NavItem, extra = '') => (
    <Link
      key={item.href}
      className={`${styles.link} ${extra}`}
      href={item.href}
      aria-current={current(item.href) ? 'page' : undefined}
    >
      {item.label}
    </Link>
  );

  return (
    <nav className={styles.nav} aria-label="Secciones">
      <span className={styles.group}>{main.map((item) => link(item))}</span>
      <span className={styles.group}>{more.map((item) => link(item, styles.secondary))}</span>
    </nav>
  );
}
