import shared from '../_shared/report.module.css';
import ui from '../_shared/ui.module.css';

/**
 * Mientras responde AnkiConnect. La pagina espera su estado (hasta unos segundos si Anki
 * esta cerrado) y sin esto se quedaba en blanco.
 */
export default function AnkiLoading() {
  return (
    <div>
      <header className={shared.head}>
        <h1>Anki</h1>
      </header>
      <p className={ui.note} role="status">
        Consultando Anki…
      </p>
    </div>
  );
}
