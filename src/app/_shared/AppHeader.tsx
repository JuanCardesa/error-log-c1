'use client';

import { Check, ChevronDown, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, useEffect, useId, useRef, useState } from 'react';

import { LOCALES } from '@/lib/i18n';

import { CommandPalette } from './CommandPalette';
import { useT } from './i18nClient';
import { Kbd } from './Kbd';
import { Menu } from './Menu';
import { isPlainKey, useShortcutLabels } from './shortcuts';
import { useLocaleSwitch } from './useLocaleSwitch';
import styles from './header.module.css';
import overlay from './overlay.module.css';

/**
 * Cabecera fija en cristal: marca, seis destinos en dos grupos —el ritual (Sesiones,
 * Errores, Progreso, Anki) y la biblioteca (Notebook, Writing)—, «Más» (Exportar y el idioma)
 * y la búsqueda global.
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
  // Desde aquí, la biblioteca: se consulta, no forma parte del registro diario.
  { href: '/notebook', label: 'notebook', key: 'n', match: ['/notebook'], library: true },
  { href: '/writing', label: 'writing', key: 'w', match: ['/writing'] },
] as const;

const EXPORT_HREF = '/exportar';

const G_WINDOW_MS = 900;

const within = (pathname: string, base: string): boolean => pathname === base || pathname.startsWith(`${base}/`);

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const keys = useShortcutLabels();
  const t = useT();
  const [palette, setPalette] = useState(false);
  const gAt = useRef(0);
  const language = useLocaleSwitch();
  const languageId = useId();

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

  const moreActive = within(pathname, EXPORT_HREF);

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
                <Fragment key={item.href}>
                  {'library' in item && <span className={styles.navSep} aria-hidden="true" />}
                  <Link
                    href={item.href}
                    className={styles.navLink}
                    aria-current={current ? 'page' : undefined}
                  >
                    {t.nav[item.label]}
                  </Link>
                </Fragment>
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
            {(close, restore) => (
              <>
                <Link
                  href={EXPORT_HREF}
                  role="menuitem"
                  className={overlay.menuItem}
                  aria-current={moreActive ? 'page' : undefined}
                  onClick={close}
                >
                  {t.nav.exportData}
                </Link>
                <div className={overlay.menuSep} role="separator" />
                {/* El idioma se elige aquí mismo: no merece una página para un solo control. */}
                <div role="group" aria-labelledby={languageId}>
                  <span id={languageId} className={overlay.menuLabel}>{t.settings.language}</span>
                  {LOCALES.map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="menuitemradio"
                      lang={value}
                      aria-checked={value === language.shown}
                      className={`${overlay.menuItem} ${overlay.menuRadio}`}
                      onClick={() => {
                        restore();
                        language.choose(value);
                      }}
                    >
                      <Check size={16} className={overlay.menuCheck} aria-hidden="true" />
                      {t.settings.languages[value]}
                    </button>
                  ))}
                </div>
              </>
            )}
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
