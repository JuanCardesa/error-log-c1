import type { Metadata } from 'next';

import { AppHeader } from './_shared/AppHeader';
import { ToastProvider } from './_shared/Toast';
import { plexMono, plexSans, sourceSerif } from './fonts';
import styles from './layout.module.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Error Log C1',
  description: 'Registro de errores para la preparación del Cambridge C1 Advanced',
};

/** `pnpm demo` la enciende; `pnpm dev` no, para que la base personal nunca lleve el aviso. */
const IS_DEMO = process.env['ERRORLOG_DEMO'] === '1';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${plexSans.variable} ${plexMono.variable} ${sourceSerif.variable}`}>
      {/* TODO(auth): herramienta local monousuario (§1). Aqui iria el proveedor de sesion. */}
      <body>
        <ToastProvider>
          <a className={styles.skip} href="#contenido">
            Saltar al contenido
          </a>
          <AppHeader />
          {IS_DEMO && (
            <p className={styles.demo} role="note">
              <strong>Demo con datos inventados.</strong> Esta base se descarta: cada
              <code> pnpm demo </code>
              crea una nueva. Para tus datos reales usa <code>pnpm dev</code>.
            </p>
          )}
          <main id="contenido" className={styles.main} tabIndex={-1}>
            {children}
          </main>
        </ToastProvider>
      </body>
    </html>
  );
}
