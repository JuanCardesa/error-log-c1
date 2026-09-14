import type { Metadata } from 'next';
import Link from 'next/link';

import styles from './layout.module.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Error Log C1',
  description: 'Registro de errores para la preparacion del Cambridge C1 Advanced',
};

const NAV = [
  { href: '/registrar', label: 'Registrar' },
  { href: '/informe', label: 'Informe' },
  { href: '/ruoe', label: 'RUOE' },
  { href: '/anki', label: 'Anki' },
  { href: '/certezas', label: 'Falsas certezas' },
  { href: '/writing', label: 'Writing' },
  { href: '/exportar', label: 'Exportar' },
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      {/* TODO(auth): herramienta local monousuario (§1). Aqui iria el proveedor de sesion. */}
      <body>
        <div className={styles.shell}>
          <header className={styles.bar}>
            <span className={styles.brand}>error-log-c1</span>
            <nav className={styles.nav} aria-label="Secciones">
              {NAV.map((item) => (
                <Link key={item.href} className={styles.link} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>
          <main className={styles.main}>{children}</main>
        </div>
      </body>
    </html>
  );
}
