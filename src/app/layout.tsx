import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Error Log C1',
  description: 'Registro de errores para la preparacion del Cambridge C1 Advanced',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      {/* TODO(auth): herramienta local monousuario. Aqui iria el proveedor de sesion. */}
      <body>{children}</body>
    </html>
  );
}
