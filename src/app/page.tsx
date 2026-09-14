import { redirect } from 'next/navigation';

export default function HomePage() {
  // Registrar es la vista de trabajo: es donde se entra a diario.
  redirect('/registrar');
}
