import { redirect } from 'next/navigation';

/**
 * Ajustes era una página para un solo control: el idioma se elige ahora en «Más» y en ⌘K.
 * Los enlaces guardados a /ajustes llevan a Sesiones.
 */
export default function AjustesPage() {
  redirect('/registrar');
}
