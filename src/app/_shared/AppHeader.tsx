'use client';

import { ChevronDown, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { CommandPalette } from './CommandPalette';
import { Kbd } from './Kbd';
import { Menu } from './Menu';
import { isPlainKey, useShortcutLabels } from './shortcuts';
import styles from './header.module.css';
import overlay from './overlay.module.css';

/**
 * Cabecera fija en cristal: marca, cuatro destinos, «Más» y la búsqueda global.
 *
 * Atajos globales: Ctrl/⌘+K abre la búsqueda; G seguida de S, E, P o A (en menos de un
 * segundo) va a Sesiones, Errores, Progreso o Anki. Las teclas sueltas no se disparan
 * dentro de un campo ni con un diálogo abierto.
 */

const NAV = [
  { href: '/registrar', label: 'Sesiones', key: 's', match: ['/registrar'] },
  { href: '/errores', label: 'Errores', key: 'e', match: ['/errores', '/certezas'] },
  { href: '/informe', label: 'Progreso', key: 'p', match: ['/informe', '/ruoe'] },
  { href: '/anki', label: 'Anki', key: 'a', match: ['/anki'] },
] as const;

const MORE = [
  { href: '/writing', label: 'Writing' },
  { href: '/exportar', label: 'Exportar datos' },
] as const;

const G_WINDOW_MS = 900;

const within = (pathname: string, base: string): boolean => pathname === base || pathname.startsWith(`${base}/`);

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const keys = useShortcutLabels();
  const [palette, setPalette] = useState(false);
  const gAt = useRef(0);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPalette((open) => !open);
        return;
      }
      if (!isPlainKey(event)) return;
      const key = event.key.toLowerCase();
      if (Date.now() - gAt.current < G_WINDOW_MS) {
        gAt.current = 0;
        const target = NAV.find((item) => item.key === key);
        if (target !== undefined) {
          event.preventDefault();
          router.push(target.href);
        }
        return;
      }
      if (key === 'g') gAt.current = Date.now();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [router]);

  const moreActive = MORE.some((item) => within(pathname, item.href));

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/registrar" className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          Error Log C1
        </Link>

        <div className={styles.navGroup}>
          <nav className={styles.nav} aria-label="Secciones">
            {NAV.map((item) => {
              const current = item.match.some((base) => within(pathname, base));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={styles.navLink}
                  aria-current={current ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Menu
            label="Más secciones"
            align="start"
            trigger={(props) => (
              <button
                type="button"
                {...props}
                className={`${styles.navLink} ${styles.moreButton}`}
                data-active={moreActive ? 'true' : undefined}
              >
                Más
                <ChevronDown size={14} aria-hidden="true" />
              </button>
            )}
          >
            {(close) => MORE.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className={overlay.menuItem}
                aria-current={within(pathname, item.href) ? 'page' : undefined}
                onClick={close}
              >
                {item.label}
              </Link>
            ))}
          </Menu>
        </div>

        <span className={styles.spacer} />

        <button
          type="button"
          className={styles.search}
          aria-label={`Buscar (${keys.search})`}
          aria-haspopup="dialog"
          onClick={() => { setPalette(true); }}
        >
          <Search size={16} aria-hidden="true" />
          <span className={styles.searchText}>Buscar errores, sesiones, acciones</span>
          <Kbd>{keys.search}</Kbd>
        </button>
      </div>

      <CommandPalette open={palette} onClose={() => { setPalette(false); }} />
    </header>
  );
}
