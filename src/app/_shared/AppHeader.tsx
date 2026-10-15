'use client';

import { ChevronDown, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { CommandPalette } from './CommandPalette';
import { useT } from './i18nClient';
import { Kbd } from './Kbd';
import { Menu } from './Menu';
import { isPlainKey, useShortcutLabels } from './shortcuts';
import styles from './header.module.css';
import overlay from './overlay.module.css';

/**
 * Cabecera fija en cristal: marca, seis destinos, «Más» (Exportar, Ajustes) y la búsqueda
 * global.
 *
 * Atajos globales: Ctrl/⌘+K abre la búsqueda; G seguida de S, E, P, A, N o W (en menos de un
 * segundo) va a Sesiones, Errores, Progreso, Anki, Notebook o Writing. Las teclas sueltas no se
 * disparan dentro de un campo ni con un diálogo abierto.
 */

const NAV = [
  { href: '/registrar', label: 'sessions', key: 's', match: ['/registrar'] },
  { href: '/errores', label: 'errors', key: 'e', match: ['/errores', '/certezas'] },
  { href: '/informe', label: 'progress', key: 'p', match: ['/informe', '/ruoe'] },
  { href: '/anki', label: 'anki', key: 'a', match: ['/anki'] },
  { href: '/notebook', label: 'notebook', key: 'n', match: ['/notebook'] },
  { href: '/writing', label: 'writing', key: 'w', match: ['/writing'] },
] as const;

const MORE = [
  { href: '/exportar', label: 'exportData' },
  { href: '/ajustes', label: 'settings' },
] as const;

const G_WINDOW_MS = 900;

const within = (pathname: string, base: string): boolean => pathname === base || pathname.startsWith(`${base}/`);

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const keys = useShortcutLabels();
  const t = useT();
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
          <nav className={styles.nav} aria-label={t.nav.sections}>
            {NAV.map((item) => {
              const current = item.match.some((base) => within(pathname, base));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={styles.navLink}
                  aria-current={current ? 'page' : undefined}
                >
                  {t.nav[item.label]}
                </Link>
              );
            })}
          </nav>

          <Menu
            label={t.nav.moreSections}
            align="start"
            trigger={(props) => (
              <button
                type="button"
                {...props}
                className={`${styles.navLink} ${styles.moreButton}`}
                data-active={moreActive ? 'true' : undefined}
              >
                {t.nav.more}
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
                {t.nav[item.label]}
              </Link>
            ))}
          </Menu>
        </div>

        <span className={styles.spacer} />

        <button
          type="button"
          className={styles.search}
          aria-label={t.nav.search(keys.search)}
          aria-haspopup="dialog"
          onClick={() => { setPalette(true); }}
        >
          <Search size={16} aria-hidden="true" />
          <span className={styles.searchText}>{t.nav.searchPlaceholder}</span>
          <Kbd>{keys.search}</Kbd>
        </button>
      </div>

      <CommandPalette open={palette} onClose={() => { setPalette(false); }} />
    </header>
  );
}
