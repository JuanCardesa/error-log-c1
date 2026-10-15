import ui from '../_shared/ui.module.css';
import { getT } from '../_shared/i18nServer';
import { LanguageSetting } from './LanguageSetting';
import styles from './ajustes.module.css';

/** Ajustes de la interfaz. Por ahora, el idioma. */

export const dynamic = 'force-dynamic';

export default async function AjustesPage() {
  const t = await getT();
  return (
    <div className={styles.page}>
      <header>
        <h1 className={ui.pageTitle}>{t.settings.title}</h1>
        <p className={ui.lede}>{t.settings.lede}</p>
      </header>
      <LanguageSetting />
    </div>
  );
}
