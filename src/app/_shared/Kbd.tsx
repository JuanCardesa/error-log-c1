import ui from './ui.module.css';

/** Tecla o combinación. Sobre un botón primario se invierte para seguir leyéndose. */
export function Kbd({ children, onPrimary = false }: {
  readonly children: React.ReactNode;
  readonly onPrimary?: boolean;
}) {
  return <kbd className={onPrimary ? ui.kbdOnPrimary : undefined}>{children}</kbd>;
}
