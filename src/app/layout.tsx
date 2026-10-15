import type { Metadata } from 'next';

import { getMessages } from '@/lib/i18n';
import { AppHeader } from './_shared/AppHeader';
import { LocaleProvider } from './_shared/i18nClient';
import { getLocale, getT } from './_shared/i18nServer';
import { ToastProvider } from './_shared/Toast';
import { plexMono, plexSans, sourceSerif } from './fonts';
import styles from './layout.module.css';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: 'Error Log C1', description: t.nav.description };
}

/** `pnpm demo` la enciende; `pnpm dev` no, para que la base personal nunca lleve el aviso. */
const IS_DEMO = process.env['ERRORLOG_DEMO'] === '1';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const t = getMessages(locale);
  return (
    <html lang={locale} className={`${plexSans.variable} ${plexMono.variable} ${sourceSerif.variable}`}>
      {/* TODO(auth): herramienta local monousuario (§1). Aqui iria el proveedor de sesion. */}
      <body>
        <LocaleProvider locale={locale}>
          <ToastProvider>
            <a className={styles.skip} href="#contenido">
              {t.nav.skipToContent}
            </a>
            <AppHeader />
            {IS_DEMO && (
              <p className={styles.demo} role="note">
                <strong>{t.nav.demoTitle}</strong> {t.nav.demoBody}
              </p>
            )}
            <main id="contenido" className={styles.main} tabIndex={-1}>
              {children}
            </main>
          </ToastProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
