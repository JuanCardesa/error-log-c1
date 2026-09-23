import type { Metadata } from 'next';
import Link from 'next/link';

import styles from './layout.module.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Error Log C1',
  description: 'Registro de errores para la preparacion del Cambridge C1 Advanced',
};

/** El uso diario: registrar lo que falla, leer que hacer y convertirlo en tarjetas. */
const NAV_MAIN = [
  { href: '/registrar', label: 'Registrar' },
  { href: '/informe', label: 'Informe' },
  { href: '/anki', label: 'Anki' },
] as const;

/** Detalle y mantenimiento: siguen a un clic, pero no compiten con las tres de arriba. */
const NAV_MORE = [
  { href: '/ruoe', label: 'RUOE' },
  { href: '/certezas', label: 'Falsas certezas' },
  { href: '/writing', label: 'Writing' },
  { href: '/exportar', label: 'Exportar' },
] as const;

/** `pnpm demo` la enciende; `pnpm dev` no, para que la base personal nunca lleve el aviso. */
const IS_DEMO = process.env['ERRORLOG_DEMO'] === '1';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      {/* TODO(auth): herramienta local monousuario (§1). Aqui iria el proveedor de sesion. */}
      <body>
        <div className={styles.shell}>
          <a className={styles.skip} href="#contenido">
            Saltar al contenido
          </a>
          <header className={styles.bar}>
            <span className={styles.brand}>error-log-c1</span>
            <nav className={styles.nav} aria-label="Secciones">
              <span className={styles.group}>
                {NAV_MAIN.map((item) => (
                  <Link key={item.href} className={styles.link} href={item.href}>
                    {item.label}
                  </Link>
                ))}
              </span>
              <span className={styles.group}>
                {NAV_MORE.map((item) => (
                  <Link key={item.href} className={`${styles.link} ${styles.secondary}`} href={item.href}>
                    {item.label}
                  </Link>
                ))}
              </span>
            </nav>
          </header>
          {IS_DEMO && (
            <p className={styles.demo} role="status">
              <strong>Demo con datos inventados.</strong> Esta base se descarta: cada
              <code> pnpm demo </code>
              crea una nueva. Para tus datos reales usa <code>pnpm dev</code>.
            </p>
          )}
          <main id="contenido" className={styles.main} tabIndex={-1}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
